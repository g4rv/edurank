'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { licencePosition, windowFor } from '@/lib/kharakterystyka/positions';
import { kharakterystykaEntrySchema } from '@/validations/kharakterystyka';

export type EntryState = { error: string } | { success: true } | null;

/**
 * Evidence typed by hand for one п.38 position.
 *
 * **ADMIN only** (2026-08-31). The rest of the document is derived and cannot be
 * edited by anybody — that is the rule at the top of `build.ts`, and it is what
 * stops the Характеристика asserting something the person's own rating does not
 * support. A typed row is the one exception, so it is held to the narrowest
 * possible audience until somebody asks for more: an НПП who could type their
 * own п.15 could also type п.1, and п.1 is a licence claim about publications
 * that exist or do not.
 *
 * Everything written here is audited, because a row nobody can trace is exactly
 * the thing this document must never contain.
 */
async function requireAdminSession() {
  const session = await auth();
  if (!session) redirect('/login');
  return session.user.role === 'ADMIN' ? session : null;
}

export async function addKharakterystykaEntry(payload: unknown): Promise<EntryState> {
  const session = await requireAdminSession();
  if (!session) return { error: 'Лише адміністратор може вносити записи' };

  const parsed = kharakterystykaEntrySchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  }
  const { staffId, position, year, text, count } = parsed.data;

  const def = licencePosition(position);
  if (!def) return { error: 'Такої позиції немає' };
  // «Для вищих військових навчальних закладів» — a row here would assert
  // something this university is not permitted to claim, so there is nothing to
  // type and the server says so rather than storing it invisibly.
  if (def.fill === 'NOT_APPLICABLE') {
    return { error: 'Ця позиція не застосовується до цього закладу' };
  }

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff?.isNpp) return { error: 'Характеристика ведеться лише для НПП' };

  // The year has to be inside the window the document actually covers, or the
  // row is stored and never appears — which reads as a save that did not work.
  const template = await getActiveTemplate();
  if (!template) return { error: 'Рейтинговий рік ще не налаштовано' };
  const { from, to } = windowFor(template.year);
  if (year < from || year > to) {
    return { error: `Рік має бути в межах ${from}–${to}` };
  }

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.kharakterystykaEntry.create({
        data: {
          staffId,
          position,
          year,
          text,
          count,
          source: 'MANUAL',
          createdBy: session.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'KharakterystykaEntry',
          entityId: created.id,
          label: `${staff.lastName} ${staff.firstName} ${staff.patronymic} — п.${position}`,
          userId: session.user.id,
          changes: diffChanges({}, { position, year, text, count }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти запис', 'kharakterystyka.addEntry', {
        userId: session.user.id,
        entityId: staffId,
      }),
    };
  }

  revalidate(staffId);
  return { success: true };
}

/**
 * Removes a typed row.
 *
 * **MANUAL rows only.** An IMPORT row came from the university's own files and
 * is replaced wholesale every time the importer runs, so deleting one here would
 * come back on the next run and look like the delete had failed.
 */
export async function deleteKharakterystykaEntry(id: string): Promise<EntryState> {
  const session = await requireAdminSession();
  if (!session) return { error: 'Лише адміністратор може вилучати записи' };

  const entry = await db.kharakterystykaEntry.findUnique({
    where: { id },
    select: {
      staffId: true,
      position: true,
      year: true,
      text: true,
      count: true,
      source: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
  });
  if (!entry) return { error: 'Запис не знайдено' };
  if (entry.source !== 'MANUAL') {
    return { error: 'Імпортовані записи вилучаються повторним імпортом, не вручну' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.kharakterystykaEntry.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'KharakterystykaEntry',
          entityId: id,
          label: `${entry.staff.lastName} ${entry.staff.firstName} ${entry.staff.patronymic} — п.${entry.position}`,
          userId: session.user.id,
          changes: diffChanges(
            { position: entry.position, year: entry.year, text: entry.text, count: entry.count },
            {}
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося вилучити запис', 'kharakterystyka.deleteEntry', {
        userId: session.user.id,
        entityId: id,
      }),
    };
  }

  revalidate(entry.staffId);
  return { success: true };
}

/**
 * Both pages that render the document, and the кафедра pages that count `Кнпп`
 * from it — a typed row changes how many positions somebody meets, which is the
 * figure a head reads beside their ставка grid.
 */
function revalidate(staffId: string) {
  revalidatePath(`/staff/${staffId}/kharakterystyka`);
  revalidatePath('/achievements/kharakterystyka');
  revalidatePath('/my-department');
  revalidatePath('/stakes');
}
