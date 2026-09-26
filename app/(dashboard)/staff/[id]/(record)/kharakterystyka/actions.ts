'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { isPositionGroup, licencePosition, windowFor } from '@/lib/kharakterystyka/positions';
import { positionEvidenceFields } from '@/lib/kharakterystyka/position-evidence';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { schemaForFields } from '@/validations/activity-evidence';
import { kharakterystykaEntrySchema } from '@/validations/kharakterystyka';
import { deleteEntryProblem, typeEntryProblem } from '@/lib/kharakterystyka/self-entry';
import { NPP_RATING_OPEN } from '@/lib/rating/npp-access';

export type EntryState = { error: string } | { success: true } | null;

/**
 * Evidence typed by hand for one п.38 position.
 *
 * **ADMIN anywhere; an НПП on п.15 and п.20 of their own document** (owner,
 * 2026-09-14). The rest of the file is derived and editable by nobody — the
 * rule at the top of `build.ts` — and that is what stops the Характеристика
 * asserting something a person's own rating does not support.
 *
 * This used to be ADMIN-only, and the note here gave the reason: «an НПП who
 * could type their own п.15 could also type п.1, and п.1 is a licence claim
 * about publications that exist or do not». That objection is answered by
 * WHICH positions opened rather than by who asked. `SELF_TYPEABLE_POSITIONS`
 * is the two the вчена рада wrote no indicator for, and nothing maps to them in
 * `LICENCE_POSITION_LINKS` — so a person typing there cannot collide with
 * derived evidence or with the 2022–2024 import, by construction. п.1 stays
 * derived and unreachable.
 *
 * Everything written here is audited, because a row nobody can trace is exactly
 * the thing this document must never contain — and now that a person can write
 * about themselves, the trail is what tells a reader which lines those are.
 */
async function entrySession() {
  const session = await auth();
  if (!session) redirect('/login');
  return session;
}

export async function addKharakterystykaEntry(payload: unknown): Promise<EntryState> {
  const session = await entrySession();

  const parsed = kharakterystykaEntrySchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  }
  const { staffId, position, year, group, evidence } = parsed.data;

  // Checked against the PARSED position, not the one the browser meant to send:
  // this is the line that keeps an НПП out of п.1.
  const denied = typeEntryProblem({
    role: session.user.role,
    ownStaffId: session.user.staffId,
    ownUserId: session.user.id,
    ratingOpen: NPP_RATING_OPEN,
    targetStaffId: staffId,
    position,
  });
  if (denied) return { error: denied };

  const def = licencePosition(position);
  if (!def) return { error: 'Такої позиції немає' };
  // «Для вищих військових навчальних закладів» — a row here would assert
  // something this university is not permitted to claim, so there is nothing to
  // type and the server says so rather than storing it invisibly.
  if (def.fill === 'NOT_APPLICABLE') {
    return { error: 'Ця позиція не застосовується до цього закладу' };
  }
  // A group belonging to some OTHER position lands the row in a bucket nothing
  // reads: it would save, and the status beside it would not move.
  if (!isPositionGroup(position, group)) {
    return { error: 'Оберіть, що саме підтверджує позицію' };
  }

  // The position's own form. Re-checked here and not only in the browser: the
  // fields decide what the licence document asserts, and the client half of a
  // shared schema is the half an attacker skips.
  const fields = positionEvidenceFields(position);
  if (fields.length === 0) return { error: 'Для цієї позиції немає форми' };

  const shape = schemaForFields(fields).safeParse(evidence);
  if (!shape.success) {
    return { error: shape.error.issues[0]?.message ?? 'Заповніть поля запису' };
  }
  // What prints. Infinity, not the default 5: this text is the deliverable, and
  // a dropped field would understate the person to a licensing authority.
  const text = summarizeEvidence(fields, shape.data, Infinity);
  if (!text.trim()) return { error: 'Заповніть хоча б одне поле' };

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
          group,
          year,
          text,
          evidence: shape.data as Prisma.InputJsonValue,
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
          changes: diffChanges({}, { position, group, year, text }),
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
  const session = await entrySession();

  const entry = await db.kharakterystykaEntry.findUnique({
    where: { id },
    select: {
      staffId: true,
      position: true,
      group: true,
      year: true,
      text: true,
      source: true,
      createdBy: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
  });
  if (!entry) return { error: 'Запис не знайдено' };

  // Reads the STORED row, never anything the caller sent: who typed it and
  // whose document it is are both facts of the row.
  const denied = deleteEntryProblem({
    role: session.user.role,
    ownStaffId: session.user.staffId,
    ownUserId: session.user.id,
    ratingOpen: NPP_RATING_OPEN,
    entry,
  });
  if (denied) return { error: denied };

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
            {
              position: entry.position,
              group: entry.group,
              year: entry.year,
              text: entry.text,
            },
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
 *
 * **The person's own copy is `/profile/kharakterystyka`** (2026-09-10). It was
 * `/achievements/kharakterystyka` until the record tabs moved, and that path is
 * now a body of `redirect()` — revalidating it refreshed nothing at all, so an
 * ADMIN typing an evidence row left the НПП looking at the old document.
 */
function revalidate(staffId: string) {
  revalidatePath(`/staff/${staffId}/kharakterystyka`);
  revalidatePath('/profile/kharakterystyka');
  revalidatePath('/my-department');
  revalidatePath('/stakes');
}
