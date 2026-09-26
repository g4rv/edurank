'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { logError } from '@/lib/log';
import { deleteObject, getObjectBytes, headObject, presignPut } from '@/lib/science/r2';
import { sniffType } from '@/lib/science/file-checks';
import {
  AVATAR_EXTENSION,
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  avatarKeyFor,
  avatarProblem,
  canSetOwnAvatar,
  isAvatarKeyOf,
} from '@/lib/staff/avatar';

/**
 * The person's own profile photo. Two steps, the same shape as an evidence file:
 * `presignAvatar` hands the browser a short-lived upload URL, the browser sends
 * the bytes straight to R2, and `saveAvatar` binds the object to the person —
 * after re-reading what was actually stored.
 *
 * Both actions act on the SESSION's own staff row and take no staff id, so there
 * is no way to point one at somebody else.
 */

type Actor = { userId: string; staffId: string };

async function resolveActor(): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const session = await auth();
  if (!session) return { ok: false, error: 'Потрібно увійти в систему' };
  if (!canSetOwnAvatar(session.user.role)) {
    return { ok: false, error: 'У вас немає доступу до цієї дії' };
  }
  const staffId = session.user.staffId;
  if (!staffId) return { ok: false, error: 'Ваш профіль не знайдено' };
  return { ok: true, actor: { userId: session.user.id, staffId } };
}

/** A presigned PUT — the app never sees the bytes at this step. */
export async function presignAvatar(input: {
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; url: string; objectKey: string } | { error: string }> {
  const who = await resolveActor();
  if (!who.ok) return { error: who.error };

  const fault = avatarProblem({ declaredType: input.contentType, sizeBytes: input.sizeBytes });
  if (fault) return { error: fault };

  const ext = AVATAR_EXTENSION[input.contentType as (typeof AVATAR_TYPES)[number]];
  const objectKey = avatarKeyFor(who.actor.staffId, ext);

  try {
    const url = await presignPut(objectKey, input.contentType);
    return { ok: true, url, objectKey };
  } catch (e) {
    // Missing credentials, the wrong jurisdiction host, a bucket that does not
    // exist — none of it is the person's doing.
    logError('profile.presignAvatar', e, { userId: who.actor.userId });
    return { error: 'Не вдалося підготувати завантаження фото' };
  }
}

/** Removes an object without ever failing the caller — a leftover costs storage, not work. */
async function dropObject(scope: string, key: string, userId: string) {
  try {
    await deleteObject(key);
  } catch (e) {
    logError(scope, e, { userId, key });
  }
}

/**
 * Bind an uploaded object to the person, after checking what is really stored.
 *
 * The key must be one of THIS person's (`avatars/<their id>/…`): a key alone is
 * not authority, and without the prefix check anybody could point their photo at
 * an object under somebody else's folder. The declared type is a claim, so the
 * first bytes decide — and a wrong or oversized object is deleted, not kept.
 */
export async function saveAvatar(input: {
  objectKey: string;
}): Promise<{ ok: true } | { error: string }> {
  const who = await resolveActor();
  if (!who.ok) return { error: who.error };
  const { userId, staffId } = who.actor;

  if (!isAvatarKeyOf(staffId, input.objectKey)) return { error: 'Некоректне фото' };

  let stored;
  try {
    stored = await headObject(input.objectKey);
  } catch (e) {
    logError('profile.saveAvatar.head', e, { userId });
    return { error: 'Не вдалося перевірити фото. Спробуйте ще раз' };
  }
  if (!stored) return { error: 'Фото не знайдено. Спробуйте завантажити ще раз' };

  if (stored.sizeBytes === 0 || stored.sizeBytes > AVATAR_MAX_BYTES) {
    await dropObject('profile.saveAvatar', input.objectKey, userId);
    return {
      error:
        avatarProblem({ declaredType: 'image/jpeg', sizeBytes: stored.sizeBytes }) ??
        'Некоректне фото',
    };
  }

  let type: string | null;
  try {
    type = sniffType(await getObjectBytes(input.objectKey));
  } catch (e) {
    logError('profile.saveAvatar.read', e, { userId });
    return { error: 'Не вдалося перевірити фото. Спробуйте ще раз' };
  }
  const allowed: readonly string[] = AVATAR_TYPES;
  if (!type || !allowed.includes(type)) {
    await dropObject('profile.saveAvatar', input.objectKey, userId);
    return { error: 'Підтримуються лише фото JPG і PNG' };
  }

  let previousKey: string | null = null;
  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({
        where: { id: staffId },
        select: { lastName: true, firstName: true, patronymic: true, avatarKey: true },
      });
      previousKey = existing?.avatarKey ?? null;

      await tx.staff.update({ where: { id: staffId }, data: { avatarKey: input.objectKey } });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: staffId,
          label: existing
            ? `${existing.lastName} ${existing.firstName} ${existing.patronymic}`
            : undefined,
          userId,
          changes: diffChanges({ avatarKey: previousKey }, { avatarKey: input.objectKey }),
        },
      });
    });
  } catch (e) {
    await dropObject('profile.saveAvatar', input.objectKey, userId);
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти фото. Зміни не застосовано',
        'profile.saveAvatar',
        {
          userId,
        }
      ),
    };
  }

  // The old photo is nobody's now — only after the new one is safely saved.
  if (previousKey && previousKey !== input.objectKey) {
    await dropObject('profile.saveAvatar.old', previousKey, userId);
  }

  revalidatePath('/profile');
  revalidatePath('/profile/edit');
  return { ok: true };
}
