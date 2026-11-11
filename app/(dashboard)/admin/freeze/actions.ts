'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { requireAdmin } from '@/lib/permissions';
import { FREEZE_SETTINGS_ID } from '@/lib/freeze/state';
import { fullStaffName } from '@/lib/staff-name';
import {
  freezeExemptionSchema,
  freezeSettingsSchema,
  type FreezeSettingsSchema,
} from '@/validations/freeze';

export type FreezeActionState = { error: string } | { success: true };

/**
 * `/admin/freeze` — the switches and the whitelist (owner, 2026-11-11). ADMIN
 * only, every change audited, nothing else: the rules that READ these are in
 * `lib/freeze`, and they take effect on the next request without a redeploy.
 */

const SETTINGS_LABEL = 'Заморозка';

/**
 * Nothing is cached per path for the freeze — it is read on every request —
 * but the pages that draw a note or hide a button are router-cached for the
 * person who last opened them.
 */
function revalidateFrozenPages() {
  revalidatePath('/admin/freeze');
  revalidatePath('/profile', 'layout');
  revalidatePath('/achievements', 'layout');
  revalidatePath('/staff', 'layout');
}

export async function updateFreezeSettings(data: FreezeSettingsSchema): Promise<FreezeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = freezeSettingsSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.freezeSettings.findUnique({
        where: { id: FREEZE_SETTINGS_ID },
        select: {
          allFrozen: true,
          kharakterystykaFrozen: true,
          linkedRatingFrozen: true,
          profileFrozen: true,
        },
      });
      const before = existing ?? {
        allFrozen: false,
        kharakterystykaFrozen: false,
        linkedRatingFrozen: false,
        profileFrozen: false,
      };

      await tx.freezeSettings.upsert({
        where: { id: FREEZE_SETTINGS_ID },
        update: { ...parsed.data, updatedById: session.user.id },
        create: { id: FREEZE_SETTINGS_ID, ...parsed.data, updatedById: session.user.id },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'FreezeSettings',
          entityId: FREEZE_SETTINGS_ID,
          label: SETTINGS_LABEL,
          userId: session.user.id,
          changes: diffChanges({ ...before }, { ...parsed.data }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'freeze.updateFreezeSettings',
        { userId: session.user.id }
      ),
    };
  }

  revalidateFrozenPages();
  return { success: true };
}

export async function addFreezeExemption(data: { staffId: string }): Promise<FreezeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = freezeExemptionSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };
  const { staffId } = parsed.data;

  const person = await db.staff.findUnique({
    where: { id: staffId },
    select: { lastName: true, firstName: true, patronymic: true, role: true, archivedAt: true },
  });
  if (!person) return { error: 'Працівника не знайдено' };
  // ADMIN is never frozen, so listing one would only mislead the next reader.
  if (person.role === 'ADMIN') return { error: 'Адміністратор і так не підпадає під заморозку' };
  if (person.archivedAt) return { error: 'Запис архівовано' };

  try {
    await db.$transaction(async (tx) => {
      // Re-adding somebody already listed is not an error and changes nothing.
      const already = await tx.freezeExemption.findUnique({ where: { staffId } });
      if (already) return;
      await tx.freezeExemption.create({ data: { staffId, createdById: session.user.id } });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'FreezeExemption',
          entityId: staffId,
          label: fullStaffName(person),
          userId: session.user.id,
          changes: diffChanges({}, { exempt: true }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося додати. Зміни не застосовано', 'freeze.addExemption', {
        userId: session.user.id,
        entityId: staffId,
      }),
    };
  }

  revalidateFrozenPages();
  return { success: true };
}

export async function removeFreezeExemption(data: { staffId: string }): Promise<FreezeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = freezeExemptionSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };
  const { staffId } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const row = await tx.freezeExemption.findUnique({
        where: { staffId },
        select: { staff: { select: { lastName: true, firstName: true, patronymic: true } } },
      });
      if (!row) return;
      await tx.freezeExemption.delete({ where: { staffId } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'FreezeExemption',
          entityId: staffId,
          label: fullStaffName(row.staff),
          userId: session.user.id,
          changes: diffChanges({ exempt: true }, {}),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося вилучити. Зміни не застосовано',
        'freeze.removeExemption',
        {
          userId: session.user.id,
          entityId: staffId,
        }
      ),
    };
  }

  revalidateFrozenPages();
  return { success: true };
}
