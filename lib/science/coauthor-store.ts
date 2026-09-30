import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { authorShare, coauthorsProblem, type CoauthorShare } from '@/lib/science/coauthors';

/**
 * Writing the co-authors of a work — everything that turns «Іваненко gets 150 год»
 * into rows, in one place so `saveRecord`, `updateCoauthors` and `lockPlan` cannot
 * disagree about what a share is.
 *
 * **A share is a `ScienceRecord` when its person has a saved plan, and a
 * `ScienceCoauthorShare` (a reservation) when they have not** — a record hangs
 * off a plan, and a plan that was never submitted must not be opened for
 * somebody on their behalf. Both count against the work's pool identically, and
 * `attachReservations` swaps the second for the first when they save the plan.
 *
 * Every function takes the caller's transaction, so a refused share rolls the
 * whole save back — a work is never left half-shared.
 *
 * `hoursHundredths` throughout is INTEGER HUNDREDTHS OF AN HOUR (see `pool.ts`).
 */

type Tx = Prisma.TransactionClient;

/** A refusal with a sentence to show — thrown inside the transaction, turned
 *  into `{ error }` by the caller. */
export class CoauthorError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

export interface WorkRef {
  id: string;
  templateId: string;
  workTypeId: string;
  totalHundredths: number;
  /** The вид роботи's own label — for audit lines. */
  typeLabel: string;
  maxPerYear: number | null;
  /**
   * Set while ННВ has DECLINED the work (owner, 2026-09-30). A decline switches
   * off every record of the work under one stamp, and the author fixing it may
   * add, remove or re-split co-authors — the very thing a decline can be about.
   * Whoever is added meanwhile must be added SWITCHED OFF with that same stamp,
   * or they would count before the author has sent the work back, and the
   * resubmit (which restores by stamp) would skip them.
   */
  declined?: { at: Date; reason: string | null; byUserId: string | null } | null;
}

/** The fields that create a record already switched off by the work's decline. */
function switchedOff(work: WorkRef) {
  return work.declined
    ? {
        status: 'REMOVED' as const,
        removedAt: work.declined.at,
        removedReason: work.declined.reason,
        removedByUserId: work.declined.byUserId,
      }
    : {};
}

/** Was this record switched off by the decline the work is under right now? */
function bySameDecline(work: WorkRef, record: { status: string; removedAt: Date | null }) {
  return (
    work.declined !== undefined &&
    work.declined !== null &&
    record.status === 'REMOVED' &&
    record.removedAt?.getTime() === work.declined.at.getTime()
  );
}

interface PersonName {
  lastName: string;
  firstName: string;
  patronymic: string | null;
}

const fullName = (p: PersonName) => `${p.lastName} ${p.firstName} ${p.patronymic ?? ''}`.trim();

/**
 * The plan that would hold this person's record: a SUBMITTED one for the work's
 * year, preferring their primary кафедра's. `null` means they have not saved one.
 */
async function lockedPlanFor(
  tx: Tx,
  staff: { id: string; departmentId: string | null },
  templateId: string
): Promise<{ id: string } | null> {
  const plans = await tx.sciencePlan.findMany({
    where: { staffId: staff.id, templateId, lockedAt: { not: null } },
    select: { id: true, departmentId: true },
  });
  if (plans.length === 0) return null;
  return plans.find((p) => p.departmentId === staff.departmentId) ?? plans[0];
}

async function capProblem(
  tx: Tx,
  work: WorkRef,
  staffId: string,
  name: string
): Promise<string | null> {
  if (!work.maxPerYear) return null;
  // APPROVED only: a declined record must not keep a slot nobody can use.
  const count = await tx.scienceRecord.count({
    where: {
      staffId,
      templateId: work.templateId,
      status: 'APPROVED',
      work: { workTypeId: work.workTypeId },
    },
  });
  return count >= work.maxPerYear
    ? `${name}: не більше ${work.maxPerYear} записів цього виду роботи на рік`
    : null;
}

/**
 * Give one person their share of a work — a record if they can hold one, a
 * reservation if not. Returns which, so the caller can say so.
 */
export async function grantShare(
  tx: Tx,
  input: { work: WorkRef; staffId: string; hoursHundredths: number; userId: string }
): Promise<'record' | 'reserved'> {
  const { work, staffId, hoursHundredths, userId } = input;

  const person = await tx.staff.findUnique({
    where: { id: staffId },
    select: {
      lastName: true,
      firstName: true,
      patronymic: true,
      isNpp: true,
      archivedAt: true,
      departmentId: true,
    },
  });
  // Only an НПП on the roster can have наукова робота — an archived person is
  // off it, and an administrative account has no plan to hold hours against.
  if (!person || !person.isNpp || person.archivedAt) {
    throw new CoauthorError('Співавтора не знайдено серед діючих НПП');
  }
  const name = fullName(person);
  const label = `${name} — ${work.typeLabel}`;

  const plan = await lockedPlanFor(
    tx,
    { id: staffId, departmentId: person.departmentId },
    work.templateId
  );

  if (plan) {
    const cap = await capProblem(tx, work, staffId, name);
    if (cap) throw new CoauthorError(cap);

    const record = await tx.scienceRecord.create({
      data: {
        staffId,
        workId: work.id,
        templateId: work.templateId,
        planId: plan.id,
        planRowId: null,
        hoursHundredths,
        ...switchedOff(work),
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'ScienceRecord',
        entityId: record.id,
        label,
        userId,
        changes: diffChanges({}, { workType: work.typeLabel, hoursHundredths, coauthor: true }),
      },
    });
    return 'record';
  }

  const share = await tx.scienceCoauthorShare.create({
    data: { workId: work.id, staffId, hoursHundredths },
    select: { id: true },
  });
  await tx.auditLog.create({
    data: {
      action: 'CREATE',
      entity: 'ScienceCoauthorShare',
      entityId: share.id,
      label,
      userId,
      changes: diffChanges({}, { workType: work.typeLabel, hoursHundredths }),
    },
  });
  return 'reserved';
}

/**
 * Replace a work's co-author list with `desired`, and give the author whatever
 * is left. Called by `updateCoauthors` — and only by the author or an ADMIN.
 *
 * Reads what exists INSIDE the transaction, never from a list the client last
 * saw, so two edits cannot both believe they started from the same one.
 */
export async function replaceCoauthors(
  tx: Tx,
  input: {
    work: WorkRef;
    authorStaffId: string;
    desired: readonly CoauthorShare[];
    userId: string;
  }
): Promise<void> {
  const { work, authorStaffId, desired, userId } = input;

  const problem = coauthorsProblem({
    totalHundredths: work.totalHundredths,
    authorStaffId,
    shares: desired,
  });
  if (problem) throw new CoauthorError(problem);

  const records = await tx.scienceRecord.findMany({
    where: { workId: work.id, staffId: { not: authorStaffId } },
    select: {
      id: true,
      staffId: true,
      status: true,
      removedAt: true,
      hoursHundredths: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
  });
  const reservations = await tx.scienceCoauthorShare.findMany({
    where: { workId: work.id },
    select: {
      id: true,
      staffId: true,
      hoursHundredths: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
  });

  const wanted = new Map(desired.map((d) => [d.staffId, d.hoursHundredths]));

  for (const record of records) {
    const label = `${fullName(record.staff)} — ${work.typeLabel}`;
    const hours = wanted.get(record.staffId);

    if (record.status === 'REMOVED' && !bySameDecline(work, record)) {
      // A record ННВ declined holds no hours and stays as the person's
      // explanation. Naming them again would collide with it (one row per
      // person per work) and quietly undo the moderator's decision.
      if (hours !== undefined) {
        throw new CoauthorError(
          `${fullName(record.staff)}: запис відхилено ННВ — додати цю людину знову не можна`
        );
      }
      continue;
    }

    if (hours === undefined) {
      await tx.scienceRecord.delete({ where: { id: record.id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label,
          userId,
          changes: diffChanges(
            { workType: work.typeLabel, hoursHundredths: record.hoursHundredths },
            {}
          ),
        },
      });
    } else if (hours !== record.hoursHundredths) {
      await tx.scienceRecord.update({ where: { id: record.id }, data: { hoursHundredths: hours } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label,
          userId,
          changes: diffChanges(
            { hoursHundredths: record.hoursHundredths },
            { hoursHundredths: hours }
          ),
        },
      });
    }
    wanted.delete(record.staffId);
  }

  for (const reservation of reservations) {
    const label = `${fullName(reservation.staff)} — ${work.typeLabel}`;
    const hours = wanted.get(reservation.staffId);

    if (hours === undefined) {
      await tx.scienceCoauthorShare.delete({ where: { id: reservation.id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'ScienceCoauthorShare',
          entityId: reservation.id,
          label,
          userId,
          changes: diffChanges({ hoursHundredths: reservation.hoursHundredths }, {}),
        },
      });
    } else if (hours !== reservation.hoursHundredths) {
      await tx.scienceCoauthorShare.update({
        where: { id: reservation.id },
        data: { hoursHundredths: hours },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceCoauthorShare',
          entityId: reservation.id,
          label,
          userId,
          changes: diffChanges(
            { hoursHundredths: reservation.hoursHundredths },
            { hoursHundredths: hours }
          ),
        },
      });
    }
    wanted.delete(reservation.staffId);
  }

  // Whoever is left in `wanted` is new.
  for (const [staffId, hoursHundredths] of wanted) {
    await grantShare(tx, { work, staffId, hoursHundredths, userId });
  }

  // The author's own record is what remains.
  await setAuthorShare(tx, {
    work,
    authorStaffId,
    hoursHundredths: authorShare(work.totalHundredths, desired),
    userId,
  });
}

/** Move the author's OWN record to `hoursHundredths`, when it differs. */
export async function setAuthorShare(
  tx: Tx,
  input: { work: WorkRef; authorStaffId: string; hoursHundredths: number; userId: string }
): Promise<void> {
  const { work, authorStaffId, hoursHundredths, userId } = input;
  const own = await tx.scienceRecord.findUnique({
    where: { staffId_workId: { staffId: authorStaffId, workId: work.id } },
    select: { id: true, status: true, removedAt: true, hoursHundredths: true },
  });
  // No record (the author withdrew theirs) or one declined on its own: nothing
  // to move. The author's row switched off by the WORK's decline does move — it
  // comes back with the rest, at the split the author just set.
  if (
    !own ||
    (own.status !== 'APPROVED' && !bySameDecline(work, own)) ||
    own.hoursHundredths === hoursHundredths
  ) {
    return;
  }

  await tx.scienceRecord.update({ where: { id: own.id }, data: { hoursHundredths } });
  await tx.auditLog.create({
    data: {
      action: 'UPDATE',
      entity: 'ScienceRecord',
      entityId: own.id,
      label: work.typeLabel,
      userId,
      changes: diffChanges({ hoursHundredths: own.hoursHundredths }, { hoursHundredths }),
    },
  });
}

/**
 * The moment somebody saves their plan, every share reserved for them becomes a
 * real record on THAT plan. Runs inside `lockPlan`'s transaction.
 *
 * A reservation on a work of another year, or one that would break the yearly
 * cap, is left where it is: the first is not this plan's to hold, the second
 * is a refusal nobody is present to read, and neither should stop somebody
 * from saving their plan.
 */
export async function attachReservations(
  tx: Tx,
  input: { staffId: string; planId: string; templateId: string; userId: string }
): Promise<number> {
  const { staffId, planId, templateId, userId } = input;

  const reservations = await tx.scienceCoauthorShare.findMany({
    where: { staffId, work: { templateId } },
    select: {
      id: true,
      hoursHundredths: true,
      work: {
        select: {
          id: true,
          templateId: true,
          workTypeId: true,
          totalHundredths: true,
          declinedAt: true,
          declineReason: true,
          declinedById: true,
          workType: { select: { label: true, maxPerYear: true } },
        },
      },
    },
  });

  let attached = 0;
  for (const reservation of reservations) {
    const work: WorkRef = {
      id: reservation.work.id,
      templateId: reservation.work.templateId,
      workTypeId: reservation.work.workTypeId,
      totalHundredths: reservation.work.totalHundredths,
      typeLabel: reservation.work.workType.label,
      maxPerYear: reservation.work.workType.maxPerYear,
      declined: reservation.work.declinedAt
        ? {
            at: reservation.work.declinedAt,
            reason: reservation.work.declineReason,
            byUserId: reservation.work.declinedById,
          }
        : null,
    };
    if (await capProblem(tx, work, staffId, '')) continue;

    const record = await tx.scienceRecord.create({
      data: {
        staffId,
        workId: work.id,
        templateId,
        planId,
        planRowId: null,
        hoursHundredths: reservation.hoursHundredths,
        // Reserved on a work ННВ has since declined: it joins switched off, like
        // everybody else on it, and comes back on the resubmit.
        ...switchedOff(work),
      },
      select: { id: true },
    });
    await tx.scienceCoauthorShare.delete({ where: { id: reservation.id } });
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'ScienceRecord',
        entityId: record.id,
        label: work.typeLabel,
        userId,
        changes: diffChanges(
          {},
          { workType: work.typeLabel, hoursHundredths: reservation.hoursHundredths, coauthor: true }
        ),
      },
    });
    attached += 1;
  }
  return attached;
}
