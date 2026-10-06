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
import { kharakterystykaEntrySchema, lineRefSchema } from '@/validations/kharakterystyka';
import {
  deleteEntryProblem,
  removeLineProblem,
  typeEntryProblem,
} from '@/lib/kharakterystyka/self-entry';
import { activityLineText, type LineRef } from '@/lib/kharakterystyka/build';
import { getKharakterystyka, getKharakterystykaWithout } from '@/lib/queries/get-kharakterystyka';
import { parseLicencePositions } from '@/validations/licence-positions';
import { logError } from '@/lib/log';
import { recomputeRatingEntry } from '@/lib/rating/recompute';
import { getSciencePlanGate } from '@/lib/queries/get-science-plan-gate';
import { PLAN_GATE_DETAIL } from '@/lib/science/plan-gate';
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

// ─── Removing a line (owner, 2026-10-06) ─────────────────────────────────────

/**
 * What removing a line does:
 *
 * - `hide` — it leaves the Характеристика (and `Кнпп`, and the document's
 *   Excel). A closed year's rating line, an imported line;
 * - `delete-entry` — a typed line, deleted outright;
 * - `delete-activity` — an OPEN year's rating line: the entry is deleted from
 *   the rating as well, so its points go and it leaves every position it fed.
 *   A line somebody says is wrong is wrong in the rating too, and the year is
 *   still open to fix it (owner, 2026-10-06).
 */
export type RemovalMode = 'hide' | 'delete-entry' | 'delete-activity';

export type RemovalPreview =
  | { error: string }
  | {
      mode: RemovalMode;
      /** The rating points that go with it — `delete-activity` only */
      score: number | null;
      position: number;
      title: string;
      metBefore: boolean;
      metAfter: boolean;
      /** «3 з 5» after the removal, where the position counts to more than one */
      progressAfter: { have: number; need: number } | null;
      metCountBefore: number;
      metCountAfter: number;
      total: number;
      qualifiesBefore: boolean;
      qualifiesAfter: boolean;
    };

/** Who is asking, in the shape `removeLineProblem` reads */
async function removalSession(staffId: string) {
  const session = await entrySession();
  const denied = removeLineProblem({
    role: session.user.role,
    ownStaffId: session.user.staffId,
    ownUserId: session.user.id,
    ratingOpen: NPP_RATING_OPEN,
    targetStaffId: staffId,
  });
  return { session, denied };
}

const ACTIVITY_LINE_SELECT = {
  staffId: true,
  year: true,
  score: true,
  status: true,
  evidence: true,
  submittedByRole: true,
  activityType: {
    select: {
      label: true,
      licencePositions: true,
      evidenceFields: true,
      template: { select: { status: true } },
    },
  },
} as const;

type StoredLine =
  | {
      kind: 'activity';
      mode: 'hide' | 'delete-activity';
      position: number;
      activity: NonNullable<Awaited<ReturnType<typeof findActivity>>>;
    }
  | {
      kind: 'entry';
      mode: 'hide' | 'delete-entry';
      position: number;
      entry: NonNullable<Awaited<ReturnType<typeof findEntry>>>;
    };

function findActivity(id: string) {
  return db.activity.findUnique({ where: { id }, select: ACTIVITY_LINE_SELECT });
}

function findEntry(id: string) {
  return db.kharakterystykaEntry.findUnique({
    where: { id },
    select: {
      staffId: true,
      position: true,
      group: true,
      year: true,
      text: true,
      source: true,
      removedAt: true,
    },
  });
}

/**
 * The line as STORED — never as the request describes it — with what removing
 * it would do, or the Ukrainian reason it cannot be removed by this person.
 */
async function storedLine(
  staffId: string,
  line: LineRef,
  who: { isAdmin: boolean }
): Promise<StoredLine | { error: string }> {
  const notFound = { error: 'Запис не знайдено' };

  if (line.kind === 'entry') {
    const entry = await findEntry(line.entryId);
    if (!entry || entry.staffId !== staffId || entry.removedAt) return notFound;
    return {
      kind: 'entry',
      mode: entry.source === 'IMPORT' ? 'hide' : 'delete-entry',
      position: entry.position,
      entry,
    };
  }

  const activity = await findActivity(line.activityId);
  const feeds =
    activity?.staffId === staffId &&
    activity.status === 'APPROVED' &&
    parseLicencePositions(activity.activityType.licencePositions).some(
      (link) => link.position === line.position
    );
  if (!activity || !feeds) return notFound;

  // A closed year is frozen history — its rating is never touched. A row the
  // profile writes (SYSTEM) would be written straight back by the next sync,
  // so it is only hidden too.
  if (activity.activityType.template.status !== 'OPEN' || activity.submittedByRole === 'SYSTEM') {
    return { kind: 'activity', mode: 'hide', position: line.position, activity };
  }
  // The rating's own rule: an НПП deletes only what they entered themselves.
  // A відділ's entry is ADMIN's to remove (owner, 2026-10-06).
  if (activity.submittedByRole !== 'NPP' && !who.isAdmin) {
    return { error: 'Цей запис внесено відділом — вилучити його може адміністратор' };
  }
  return { kind: 'activity', mode: 'delete-activity', position: line.position, activity };
}

/**
 * What removing one line would change — the dialog shows it before anybody
 * confirms (owner, 2026-10-06): whether the rating loses it, whether the
 * position stays met, and the document's «N з 20», which is what `Кнпп` counts.
 */
export async function previewLineRemoval(
  staffId: string,
  payload: unknown
): Promise<RemovalPreview> {
  const parsed = lineRefSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані' };
  const { session, denied } = await removalSession(staffId);
  if (denied) return { error: denied };

  const isAdmin = session.user.role === 'ADMIN';
  const stored = await storedLine(staffId, parsed.data, { isAdmin });
  if ('error' in stored) return stored;
  // Asked here as well as on removal, so the dialog says it before the button
  // is pressed rather than after (a rating change waits for a saved plan, D56).
  if (stored.mode === 'delete-activity' && !isAdmin) {
    if (!(await getSciencePlanGate(staffId)).open) return { error: PLAN_GATE_DETAIL };
  }

  const template = await getActiveTemplate();
  if (!template) return { error: 'Рейтинговий рік ще не налаштовано' };

  const [before, after] = await Promise.all([
    getKharakterystyka(staffId, template.year),
    getKharakterystykaWithout(
      staffId,
      template.year,
      parsed.data,
      stored.mode === 'delete-activity'
    ),
  ]);
  const was = before?.positions.find((p) => p.number === stored.position);
  const now = after?.positions.find((p) => p.number === stored.position);
  if (!before || !after || !was || !now) return { error: 'Запис не знайдено' };

  return {
    mode: stored.mode,
    score:
      stored.kind === 'activity' && stored.mode === 'delete-activity'
        ? stored.activity.score
        : null,
    position: stored.position,
    title: was.title,
    metBefore: was.met,
    metAfter: now.met,
    progressAfter: now.progress,
    metCountBefore: before.metCount,
    metCountAfter: after.metCount,
    total: after.positions.length,
    qualifiesBefore: before.qualifies,
    qualifiesAfter: after.qualifies,
  };
}

/**
 * Takes one line out of a Характеристика — for good (owner, 2026-10-06).
 *
 * **ADMIN on anybody's, an НПП on their own; any line** (`removeLineProblem`),
 * except that an НПП cannot remove a відділ's entry from an open year. What
 * happens is `RemovalMode`:
 *
 * - **a closed year's rating line** is recorded in `KharakterystykaRemovedLine`
 *   for THIS position; the activity, its score and the year's snapshot stay;
 * - **an open year's rating line** is deleted from the rating — the same delete
 *   «Мій рейтинг» does, its `RatingEntry` recomputed — and so leaves every
 *   position it fed. An НПП must have their science plan saved, as for any
 *   rating change (`planGate`);
 * - **an imported line** is hidden (`removedAt`), not deleted, so the next
 *   import run cannot bring it back;
 * - **a typed line** is deleted, as the «Записи вручну» dialog always has.
 *
 * Nothing restores any of them. Audited like every other change.
 */
export async function removeKharakterystykaLine(
  staffId: string,
  payload: unknown
): Promise<EntryState> {
  const parsed = lineRefSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані' };
  const line = parsed.data;
  const { session, denied } = await removalSession(staffId);
  if (denied) return { error: denied };
  const isAdmin = session.user.role === 'ADMIN';

  const stored = await storedLine(staffId, line, { isAdmin });
  if ('error' in stored) return stored;

  // A rating change, so the НПП's own rule for one applies (D56)
  if (stored.mode === 'delete-activity' && !isAdmin) {
    if (!(await getSciencePlanGate(staffId)).open) return { error: PLAN_GATE_DETAIL };
  }

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { lastName: true, firstName: true, patronymic: true },
  });
  if (!staff) return { error: 'Запис не знайдено' };
  const name = `${staff.lastName} ${staff.firstName} ${staff.patronymic}`;

  try {
    await db.$transaction(async (tx) => {
      if (stored.kind === 'activity') {
        const { activity } = stored;
        const text = activityLineText(activity.activityType, activity.evidence);
        if (stored.mode === 'delete-activity' && line.kind === 'activity') {
          await tx.activity.delete({ where: { id: line.activityId } });
          await tx.auditLog.create({
            data: {
              action: 'DELETE',
              entity: 'Activity',
              entityId: line.activityId,
              label: `${name} — ${activity.activityType.label} (вилучено з характеристики)`,
              userId: session.user.id,
              changes: diffChanges({ score: activity.score, status: activity.status, text }, {}),
            },
          });
          await recomputeRatingEntry(tx, staffId, activity.year);
        } else if (line.kind === 'activity') {
          // Twice is the same as once — a second click, or two tabs
          await tx.kharakterystykaRemovedLine.createMany({
            data: [
              { activityId: line.activityId, position: line.position, removedBy: session.user.id },
            ],
            skipDuplicates: true,
          });
          await tx.auditLog.create({
            data: {
              action: 'DELETE',
              entity: 'KharakterystykaEntry',
              entityId: `${line.activityId}:${line.position}`,
              label: `${name} — п.${line.position}`,
              userId: session.user.id,
              changes: diffChanges({ position: line.position, year: activity.year, text }, {}),
            },
          });
        }
        return;
      }

      const { entry } = stored;
      if (line.kind !== 'entry') return;
      if (stored.mode === 'hide') {
        await tx.kharakterystykaEntry.update({
          where: { id: line.entryId },
          data: { removedAt: new Date(), removedBy: session.user.id },
        });
      } else {
        await tx.kharakterystykaEntry.delete({ where: { id: line.entryId } });
      }
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'KharakterystykaEntry',
          entityId: line.entryId,
          label: `${name} — п.${entry.position}`,
          userId: session.user.id,
          changes: diffChanges(
            { position: entry.position, group: entry.group, year: entry.year, text: entry.text },
            {}
          ),
        },
      });
    });
  } catch (e) {
    logError('kharakterystyka.removeLine', e, { userId: session.user.id, entityId: staffId });
    return { error: 'Не вдалося вилучити запис. Нічого не змінено' };
  }

  revalidate(staffId);
  if (stored.mode === 'delete-activity') {
    revalidatePath('/profile/rating');
    revalidatePath(`/staff/${staffId}/rating`);
  }
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
