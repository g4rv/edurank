'use server';

import { db } from '@/lib/db';
import { logError } from '@/lib/log';
import { authoriseEducationWrite } from '@/lib/language-certificates/access';
import { authoriseQualifications } from '@/lib/qualifications/guard';
import { fileProblem } from '@/lib/science/file-checks';
import { safeDeleteObject } from '@/lib/science/file-intake';
import { diplomaKeyFor, isDiplomaKeyOf, presignGet, presignPut } from '@/lib/science/r2';
import { DIPLOMA_SCAN_TYPE, DIPLOMA_SCAN_TYPE_MESSAGE } from '@/lib/staff/diploma-scan';

// The scan of an НПП's кандидат / доктор diploma (owner, 2026-10-27): optional,
// JPG only. The language certificates' flow (`../language-certificates/
// file-actions.ts`): the browser PUTs straight to R2, the profile save carries
// the key and verifies it from the stored bytes (`lib/staff/diplomas.ts`).
// Whoever may change the person's diplomas (the `degrees` grant) may upload.

/** A presigned PUT into the person's own diploma folder. */
export async function presignDiplomaUpload(input: {
  staffId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; url: string; objectKey: string } | { error: string }> {
  const allowed = await authoriseEducationWrite(input.staffId, 'degrees');
  if ('error' in allowed) return { error: allowed.error };

  if (input.contentType !== DIPLOMA_SCAN_TYPE) return { error: DIPLOMA_SCAN_TYPE_MESSAGE };
  const sizeFault = fileProblem({ declaredType: input.contentType, sizeBytes: input.sizeBytes });
  if (sizeFault) return { error: sizeFault };

  const objectKey = diplomaKeyFor({ staffId: input.staffId });
  try {
    const url = await presignPut(objectKey, input.contentType);
    return { ok: true, url, objectKey };
  } catch (e) {
    logError('diplomas.presignUpload', e, { userId: allowed.userId });
    return { error: 'Не вдалося підготувати завантаження файлу' };
  }
}

/**
 * Throw away an upload nobody ended up pointing at. Fire-and-forget from the
 * browser; never an object a diploma holds, never one outside a folder the
 * caller may write.
 */
export async function discardDiplomaUpload(
  staffId: string,
  objectKey: string
): Promise<{ ok: true }> {
  const allowed = await authoriseEducationWrite(staffId, 'degrees');
  if ('error' in allowed) return { ok: true };
  if (!isDiplomaKeyOf(staffId, objectKey)) return { ok: true };

  const held = await db.diploma.findUnique({ where: { fileKey: objectKey }, select: { id: true } });
  if (!held) {
    await safeDeleteObject('diplomas.discardUpload', objectKey, { userId: allowed.userId });
  }
  return { ok: true };
}

/**
 * A short-lived signed GET for one diploma's scan. Who may open it is the rule
 * every scan of a person answers to (`authoriseQualifications(…, 'read')`): the
 * НПП, ADMIN, a division with «Перегляд підвищення кваліфікації».
 */
export async function diplomaFileUrl(
  diplomaId: string
): Promise<{ ok: true; url: string } | { error: string }> {
  const row = await db.diploma.findUnique({
    where: { id: diplomaId },
    select: { staffId: true, fileKey: true },
  });
  if (!row) return { error: 'Диплом не знайдено' };
  const authorised = await authoriseQualifications(row.staffId, 'read');
  if ('error' in authorised) return { error: 'У вас немає доступу до цього файлу' };
  if (!row.fileKey) return { error: 'До цього диплома файл не додано' };

  try {
    return { ok: true, url: await presignGet(row.fileKey) };
  } catch (e) {
    logError('diplomas.fileUrl', e, { userId: authorised.caller.userId });
    return { error: 'Не вдалося отримати посилання на файл' };
  }
}
