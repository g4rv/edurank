'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { isNnvOversight } from '@/lib/science/oversight';

/**
 * ННВ (or ADMIN) declines a наукова робота record after the fact — D20's
 * post-check, never a gate: the record already counted the moment it was
 * saved, and this is the one way it stops.
 *
 * Mirrors `removeActivity` in `app/(dashboard)/moderation/actions.ts` exactly:
 * a required reason, trimmed and capped at 500 characters, a soft status
 * change inside a transaction, an audit entry.
 *
 * **One deliberate difference, per the plan's own note:** the guard is
 * `isNnvOversight` (`lib/science/oversight.ts`), not `canModerateRating`
 * (`lib/rating/moderation.ts`). Наукова робота oversight belongs to ННВ
 * specifically by наказ №152 п.3 — a different permission in principle from
 * whichever division an ADMIN happens to grant the rating's own moderation
 * flag to, even though the seed carries both on ННВ today.
 *
 * **The row STAYS, marked REMOVED.** The person has to be able to read why —
 * `record-list.tsx` already renders `removedReason` for a REMOVED record
 * (built before anything could set the status). And every sum over
 * `hoursHundredths` filters on `status: 'APPROVED'`
 * (`lib/queries/get-science-plan.ts`, `lib/queries/list-science-plans.ts`,
 * every pool check in `record-actions.ts`), so this action never has to touch
 * `hoursHundredths` itself — the hours a declined draw held are free for a
 * co-author to take the instant the status flips.
 *
 * **Refused once the record's own template is not OPEN** — the same
 * `'Планування на цей рік закрито'` check every write in `record-actions.ts`
 * carries (`resolveActor`), and the exact rule `removeActivity` enforces for
 * the rating (`activity.activityType.template.status !== 'OPEN'`). The
 * spec's own «Validation and anti-cheat» list refuses any write to a CLOSED
 * template, not only НПП self-entry — a decline is a write too.
 */
export async function removeScienceRecord(
  recordId: string,
  reason: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await isNnvOversight(session.user))) return { error: 'Недостатньо прав' };

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: 'Вкажіть причину відхилення' };
  if (trimmedReason.length > 500) return { error: 'Причина занадто довга (до 500 символів)' };

  const record = await db.scienceRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      status: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
      work: { select: { workType: { select: { label: true } } } },
      template: { select: { status: true } },
    },
  });

  if (!record) return { error: 'Запис не знайдено' };
  if (record.status !== 'APPROVED') return { error: 'Цей запис не можна відхилити' };
  if (record.template.status !== 'OPEN') return { error: 'Планування на цей рік закрито' };

  const auditLabel =
    `${record.staff.lastName} ${record.staff.firstName} ${record.staff.patronymic ?? ''} — ${record.work.workType.label}`.trim();

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceRecord.update({
        where: { id: record.id },
        data: {
          status: 'REMOVED',
          removedByUserId: session.user.id,
          removedAt: new Date(),
          removedReason: trimmedReason,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label: auditLabel,
          userId: session.user.id,
          changes: diffChanges(
            { status: record.status, removedReason: null },
            { status: 'REMOVED', removedReason: trimmedReason }
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося відхилити. Зміни не застосовано',
        'moderation.removeScienceRecord',
        { userId: session.user.id }
      ),
    };
  }

  revalidatePath('/moderation');
  revalidatePath('/science-plan');
  revalidatePath('/science-plans');
  return { ok: true };
}

/**
 * Undo a decline — ННВ's own mistake (wrong кафедра, misread evidence) must
 * not cost the person their record permanently. Clears every field
 * `removeScienceRecord` set and puts the record back to APPROVED, where it
 * counts toward виконано again.
 *
 * **Not a silent revival of an edited record** — the plan deliberately keeps
 * a declined row REMOVED even after the person edits something else on it;
 * this action is the only way back, and it is ННВ's / ADMIN's own act, not
 * automatic.
 *
 * **Refused once the record's own template is not OPEN** — the same rule as
 * `removeScienceRecord`, applied symmetrically: a restore is a write too, and
 * the spec's «Validation and anti-cheat» list does not exempt undoing a
 * decline from the CLOSED-template refusal.
 */
export async function restoreScienceRecord(
  recordId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await isNnvOversight(session.user))) return { error: 'Недостатньо прав' };

  const record = await db.scienceRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      status: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
      work: { select: { workType: { select: { label: true } } } },
      template: { select: { status: true } },
    },
  });

  if (!record) return { error: 'Запис не знайдено' };
  if (record.status !== 'REMOVED') return { error: 'Цей запис не відхилено' };
  if (record.template.status !== 'OPEN') return { error: 'Планування на цей рік закрито' };

  const auditLabel =
    `${record.staff.lastName} ${record.staff.firstName} ${record.staff.patronymic ?? ''} — ${record.work.workType.label}`.trim();

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceRecord.update({
        where: { id: record.id },
        data: {
          status: 'APPROVED',
          removedByUserId: null,
          removedAt: null,
          removedReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceRecord',
          entityId: record.id,
          label: auditLabel,
          userId: session.user.id,
          changes: diffChanges({ status: record.status }, { status: 'APPROVED' }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося відновити. Зміни не застосовано',
        'moderation.restoreScienceRecord',
        { userId: session.user.id }
      ),
    };
  }

  revalidatePath('/moderation');
  revalidatePath('/science-plan');
  revalidatePath('/science-plans');
  return { ok: true };
}
