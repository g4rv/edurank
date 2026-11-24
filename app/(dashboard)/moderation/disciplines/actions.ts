'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { canModerateRating } from '@/lib/rating/moderation';
import { hasDisciplineField } from '@/lib/disciplines/assigned';
import { assignedTarget, countEntryProblem, withDiscipline } from '@/lib/disciplines/count-entry';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import { fullStaffName } from '@/lib/staff-name';
import type { Prisma } from '@/lib/generated/prisma/client';

export type CountEntryState = { error: string } | { success: true };

/**
 * «Зарахувати» (owner, 2026-11-24): count one of a person's entries for a
 * discipline they are missing, by giving the entry that discipline's name. ADMIN
 * and ННВ (`canModerateRating`), the open year only. Only the `discipline` text
 * changes — the link, the materials, the answer to «Я лектор» and the points stay.
 * Audited, with the old name, so it can be read back and undone by hand.
 */
export async function countEntryForDiscipline(input: {
  activityId: string;
  discipline: string;
}): Promise<CountEntryState> {
  const session = await auth();
  if (!session) redirect('/login');
  if (!(await canModerateRating(session.user))) return { error: 'Недостатньо прав' };

  const activityId = String(input.activityId ?? '');
  const discipline = String(input.discipline ?? '').trim();
  if (!activityId || !discipline) return { error: 'Оберіть запис' };

  const entry = await db.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      staffId: true,
      year: true,
      status: true,
      evidence: true,
      activityTypeId: true,
      activityType: {
        select: {
          label: true,
          gatesRating: true,
          evidenceFields: true,
          template: { select: { status: true } },
        },
      },
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
  });
  if (!entry) return { error: 'Запис не знайдено' };
  if (entry.activityType.template.status !== 'OPEN') return { error: 'Рейтинговий рік закрито' };
  const fields = evidenceFieldsSpecSchema.safeParse(entry.activityType.evidenceFields);
  if (!entry.activityType.gatesRating || !fields.success || !hasDisciplineField(fields.data)) {
    return { error: 'Цей запис не належить до пункту з дисциплінами' };
  }
  if (entry.status !== 'APPROVED') return { error: 'Цей запис не зараховується' };

  let result: CountEntryState;
  try {
    result = await db.$transaction(async (tx): Promise<CountEntryState> => {
      // Read again inside the transaction: two moderators may be on the page at once
      const assigned = await tx.assignedDiscipline.findMany({
        where: { staffId: entry.staffId, year: entry.year },
        select: { name: true, nameNormalised: true, acceptedAt: true },
      });
      const others = await tx.activity.findMany({
        where: {
          staffId: entry.staffId,
          year: entry.year,
          activityTypeId: entry.activityTypeId,
          status: 'APPROVED',
          id: { not: entry.id },
        },
        select: { evidence: true },
      });
      const fresh = await tx.activity.findUnique({
        where: { id: entry.id },
        select: { evidence: true, status: true },
      });
      if (!fresh || fresh.status !== 'APPROVED') return { error: 'Цей запис не зараховується' };

      const problem = countEntryProblem({
        assigned: assigned.map((a) => ({ ...a, accepted: Boolean(a.acceptedAt) })),
        target: discipline,
        entryEvidence: fresh.evidence,
        otherEvidence: others.map((o) => o.evidence),
      });
      if (problem) return { error: problem };

      const target = assignedTarget(assigned, discipline)!;
      const before = (fresh.evidence as Record<string, unknown>).discipline;
      await tx.activity.update({
        where: { id: entry.id },
        data: { evidence: withDiscipline(fresh.evidence, target.name) as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Activity',
          entityId: entry.id,
          label: `${fullStaffName(entry.staff)} — ${entry.activityType.label}: запис зараховано за призначеною дисципліною`,
          userId: session.user.id,
          changes: diffChanges(
            { discipline: typeof before === 'string' ? before : null },
            { discipline: target.name }
          ),
        },
      });
      return { success: true };
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зарахувати. Зміни не застосовано',
        'moderation.countEntryForDiscipline',
        { userId: session.user.id }
      ),
    };
  }

  if ('success' in result) {
    revalidatePath('/moderation/disciplines');
    revalidatePath(`/staff/${entry.staffId}/rating`);
    revalidatePath('/profile/rating');
  }
  return result;
}

export type AcceptDisciplineState = { error: string } | { success: true };

/** The row a moderator acts on, and why they may not (null problem = go ahead) */
type AcceptanceTarget =
  | { error: string }
  | { row: { id: string; name: string; nameNormalised: string; acceptedAt: Date | null } };

async function acceptanceTarget(staffId: string, discipline: string): Promise<AcceptanceTarget> {
  const name = String(discipline ?? '').trim();
  if (!staffId || !name) return { error: 'Оберіть дисципліну' };
  const template = await db.ratingTemplate.findFirst({
    where: { status: 'OPEN' },
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  if (!template) return { error: 'Рейтинговий рік закрито' };
  const rows = await db.assignedDiscipline.findMany({
    where: { staffId, year: template.year },
    select: { id: true, name: true, nameNormalised: true, acceptedAt: true },
  });
  const row = assignedTarget(rows, name);
  if (!row) return { error: 'Такої дисципліни немає у списку цієї людини' };
  return { row };
}

/**
 * «Зарахувати без запису» (owner, 2026-11-24): a moderator counts one assigned
 * discipline for a person with NO entry behind it — the work was done and the
 * departments' list is wrong, or the entry cannot be matched. ADMIN and ННВ, the
 * open year only. Nothing is written to the person's entries; the discipline
 * itself carries who accepted it and when, and the rule reads it as answered.
 * Taken back with `revokeAcceptance`. Audited both ways.
 */
export async function acceptDiscipline(input: {
  staffId: string;
  discipline: string;
}): Promise<AcceptDisciplineState> {
  const session = await auth();
  if (!session) redirect('/login');
  if (!(await canModerateRating(session.user))) return { error: 'Недостатньо прав' };

  const target = await acceptanceTarget(String(input.staffId ?? ''), input.discipline);
  if ('error' in target) return target;
  const { row } = target;
  if (row.acceptedAt) return { error: 'Цю дисципліну вже зараховано' };

  const person = await db.staff.findUnique({
    where: { id: input.staffId },
    select: { lastName: true, firstName: true, patronymic: true },
  });
  if (!person) return { error: 'Людину не знайдено' };

  try {
    const result = await db.$transaction(async (tx): Promise<AcceptDisciplineState> => {
      // Read again inside the transaction: it may have been answered meanwhile
      const fresh = await tx.assignedDiscipline.findUnique({
        where: { id: row.id },
        select: { acceptedAt: true },
      });
      if (!fresh || fresh.acceptedAt) return { error: 'Цю дисципліну вже зараховано' };
      await tx.assignedDiscipline.update({
        where: { id: row.id },
        data: { acceptedAt: new Date(), acceptedById: session.user.id },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'AssignedDiscipline',
          entityId: row.id,
          label: `${fullStaffName(person)} — п. 5.1: «${row.name}» зараховано без запису`,
          userId: session.user.id,
          changes: diffChanges({ accepted: false }, { accepted: true }),
        },
      });
      return { success: true };
    });
    if ('success' in result) revalidateDisciplinePages(input.staffId);
    return result;
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зарахувати. Зміни не застосовано',
        'moderation.acceptDiscipline',
        {
          userId: session.user.id,
        }
      ),
    };
  }
}

/** Takes back an acceptance: the discipline needs an entry again. Same rights, open year only. */
export async function revokeAcceptance(input: {
  staffId: string;
  discipline: string;
}): Promise<AcceptDisciplineState> {
  const session = await auth();
  if (!session) redirect('/login');
  if (!(await canModerateRating(session.user))) return { error: 'Недостатньо прав' };

  const target = await acceptanceTarget(String(input.staffId ?? ''), input.discipline);
  if ('error' in target) return target;
  const { row } = target;
  if (!row.acceptedAt) return { error: 'Цю дисципліну не було зараховано без запису' };

  const person = await db.staff.findUnique({
    where: { id: input.staffId },
    select: { lastName: true, firstName: true, patronymic: true },
  });
  if (!person) return { error: 'Людину не знайдено' };

  try {
    await db.$transaction(async (tx) => {
      await tx.assignedDiscipline.update({
        where: { id: row.id },
        data: { acceptedAt: null, acceptedById: null },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'AssignedDiscipline',
          entityId: row.id,
          label: `${fullStaffName(person)} — п. 5.1: зарахування «${row.name}» без запису скасовано`,
          userId: session.user.id,
          changes: diffChanges({ accepted: true }, { accepted: false }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося скасувати. Зміни не застосовано',
        'moderation.revokeAcceptance',
        {
          userId: session.user.id,
        }
      ),
    };
  }
  revalidateDisciplinePages(input.staffId);
  return { success: true };
}

function revalidateDisciplinePages(staffId: string) {
  revalidatePath('/moderation/disciplines');
  revalidatePath(`/staff/${staffId}/rating`);
  revalidatePath('/profile/rating');
}
