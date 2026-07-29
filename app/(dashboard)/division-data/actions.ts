'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { canActForDivision } from '@/lib/permissions';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { parseTypeSpecs } from '@/validations/activity-type-spec';
import { computeScore } from '@/lib/rating/scoring';
import { recomputeRatingEntry } from '@/lib/rating/recompute';

export type UpsertDivisionActivityState = { error: string } | { success: true; score: number };

// A division enters (or corrects) its managed value for one NPP in the active
// year. One live row per staff/type/year: find-then-update inside the
// transaction — there is no DB unique constraint (repeatable NPP types forbid one).
export async function upsertDivisionActivity(
  staffId: string,
  activityTypeId: string,
  evidence: unknown
): Promise<UpsertDivisionActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  const type = await db.activityType.findUnique({
    where: { id: activityTypeId },
    select: {
      id: true,
      code: true,
      label: true,
      coefficient: true,
      inputSource: true,
      isActive: true,
      verifyingDivisionId: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true, isActive: true, status: true } },
    },
  });
  if (
    !type ||
    !type.isActive ||
    type.inputSource !== 'DIVISION_MANAGED' ||
    !type.verifyingDivisionId
  ) {
    return { error: 'Цей показник не вноситься відділом' };
  }
  if (!type.template.isActive || type.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  if (!(await canActForDivision(session.user, type.verifyingDivisionId))) {
    return { error: 'Недостатньо прав' };
  }

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff?.isNpp) return { error: 'Рейтинг ведеться лише для НПП' };

  let specs: ReturnType<typeof parseTypeSpecs>;
  try {
    specs = parseTypeSpecs(type);
  } catch {
    return { error: 'Невідомий показник' };
  }

  const parsed = specs.schema.safeParse(evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const year = type.template.year;
  const { computedValue, score } = computeScore(
    {
      code: type.code,
      coefficient: type.coefficient,
      scoring: specs.scoring,
      evidenceFields: specs.fields,
    },
    parsed.data
  );
  const evidenceSummary = summarizeEvidence(specs.fields, parsed.data);
  const staffLabel = `${staff.lastName} ${staff.firstName} ${staff.patronymic}`;

  // Find-then-write is a race: two editors saving the same cell both see no row
  // and both insert. The partial unique index stops the duplicate reaching the
  // table; running the same body again then finds the winner's row and takes the
  // update path, which is what the loser meant to do anyway.
  const save = () =>
    db.$transaction(async (tx) => {
      const existing = await tx.activity.findFirst({
        where: { staffId, activityTypeId: type.id, year, status: { not: 'REMOVED' } },
        select: { id: true, score: true, evidence: true },
      });

      const data = {
        evidence: parsed.data as Prisma.InputJsonValue,
        computedValue,
        score,
        status: 'APPROVED' as const,
        submittedByRole: 'DIVISION' as const,
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
      };

      if (existing) {
        await tx.activity.update({ where: { id: existing.id }, data });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'Activity',
            entityId: existing.id,
            label: `${staffLabel} — ${type.label}`,
            userId: session.user.id,
            changes: diffChanges(
              {
                score: existing.score,
                evidence: summarizeEvidence(specs.fields, existing.evidence),
              },
              { score, evidence: evidenceSummary }
            ),
          },
        });
      } else {
        const created = await tx.activity.create({
          data: { staffId, activityTypeId: type.id, year, ...data },
        });
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            entity: 'Activity',
            entityId: created.id,
            label: `${staffLabel} — ${type.label}`,
            userId: session.user.id,
            changes: diffChanges(
              {},
              { year, score, status: 'APPROVED', evidence: evidenceSummary }
            ),
          },
        });
      }

      await recomputeRatingEntry(tx, staffId, year);
    });

  try {
    await save();
  } catch (e) {
    if (!isUniqueViolation(e)) {
      return { error: parseDbError(e, 'Помилка при внесенні даних') };
    }
    try {
      await save();
    } catch (retryError) {
      return { error: parseDbError(retryError, 'Помилка при внесенні даних') };
    }
  }

  revalidatePath('/division-data');
  return { success: true, score };
}

export type ClearDivisionActivityState = { error: string } | { success: true };

// A division clears a value it entered by mistake (e.g. wrong staff row in the
// grid). Hard delete + audit: division entries need no discard trail — the
// division is the source of truth for them, unlike moderated NPP self-reports.
export async function clearDivisionActivity(
  activityId: string
): Promise<ClearDivisionActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      staffId: true,
      year: true,
      score: true,
      status: true,
      submittedByRole: true,
      activityType: {
        select: {
          label: true,
          verifyingDivisionId: true,
          template: { select: { status: true } },
        },
      },
    },
  });

  if (!activity) return { error: 'Запис не знайдено' };
  if (activity.submittedByRole !== 'DIVISION' || !activity.activityType.verifyingDivisionId) {
    return { error: 'Цей запис не вноситься відділом' };
  }
  if (activity.activityType.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }
  if (!(await canActForDivision(session.user, activity.activityType.verifyingDivisionId))) {
    return { error: 'Недостатньо прав' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.activity.delete({ where: { id: activity.id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Activity',
          entityId: activity.id,
          label: activity.activityType.label,
          userId: session.user.id,
          changes: diffChanges({ score: activity.score, status: activity.status }, {}),
        },
      });
      await recomputeRatingEntry(tx, activity.staffId, activity.year);
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при видаленні') };
  }

  revalidatePath('/division-data');
  return { success: true };
}

export type BatchUpsertDivisionActivityState = { error: string } | { success: true; saved: number };

// Entity-first bulk entry: one object (project / council / program) fanned out
// to several NPP in a single transaction. Each row gets the same shared
// evidence plus its own role, and becomes a normal per-staff Activity —
// identical to what upsertDivisionActivity would create one at a time.
export async function batchUpsertDivisionActivity(
  activityTypeId: string,
  rows: { staffId: string; evidence: unknown }[]
): Promise<BatchUpsertDivisionActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (rows.length === 0) return { error: 'Додайте хоча б одного НПП' };
  if (rows.length > 100) return { error: 'Забагато записів за один раз' };

  const staffIds = rows.map((r) => r.staffId);
  if (new Set(staffIds).size !== staffIds.length) {
    return { error: 'Один НПП вказано декілька разів' };
  }

  const type = await db.activityType.findUnique({
    where: { id: activityTypeId },
    select: {
      id: true,
      code: true,
      label: true,
      coefficient: true,
      inputSource: true,
      isActive: true,
      verifyingDivisionId: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true, isActive: true, status: true } },
    },
  });
  if (
    !type ||
    !type.isActive ||
    type.inputSource !== 'DIVISION_MANAGED' ||
    !type.verifyingDivisionId
  ) {
    return { error: 'Цей показник не вноситься відділом' };
  }
  if (!type.template.isActive || type.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  if (!(await canActForDivision(session.user, type.verifyingDivisionId))) {
    return { error: 'Недостатньо прав' };
  }

  const staffList = await db.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, isNpp: true, lastName: true, firstName: true, patronymic: true },
  });
  const staffById = new Map(staffList.map((s) => [s.id, s]));
  for (const id of staffIds) {
    const s = staffById.get(id);
    if (!s) return { error: 'НПП не знайдено' };
    if (!s.isNpp) {
      return { error: `${s.lastName} ${s.firstName} ${s.patronymic} — не НПП` };
    }
  }

  let specs: ReturnType<typeof parseTypeSpecs>;
  try {
    specs = parseTypeSpecs(type);
  } catch {
    return { error: 'Невідомий показник' };
  }
  const scorable = {
    code: type.code,
    coefficient: type.coefficient,
    scoring: specs.scoring,
    evidenceFields: specs.fields,
  };

  // Validate everything up front — the transaction is all-or-nothing
  const prepared: {
    staffId: string;
    staffLabel: string;
    evidence: Prisma.InputJsonValue;
    computedValue: number;
    score: number;
    summary: string;
  }[] = [];
  for (const row of rows) {
    const parsed = specs.schema.safeParse(row.evidence);
    if (!parsed.success) return { error: 'Невірні дані форми' };
    const { computedValue, score } = computeScore(scorable, parsed.data);
    const s = staffById.get(row.staffId)!;
    prepared.push({
      staffId: row.staffId,
      staffLabel: `${s.lastName} ${s.firstName} ${s.patronymic}`,
      evidence: parsed.data as Prisma.InputJsonValue,
      computedValue,
      score,
      summary: summarizeEvidence(specs.fields, parsed.data),
    });
  }

  const year = type.template.year;

  // Same lost-race handling as the single-cell save above: the whole batch is
  // one transaction, so a collision on any one row rolls all of them back and
  // the retry re-reads every row, updating the ones that now exist.
  const saveAll = () =>
    db.$transaction(async (tx) => {
      for (const row of prepared) {
        const existing = await tx.activity.findFirst({
          where: {
            staffId: row.staffId,
            activityTypeId: type.id,
            year,
            status: { not: 'REMOVED' },
          },
          select: { id: true, score: true, evidence: true },
        });

        const data = {
          evidence: row.evidence,
          computedValue: row.computedValue,
          score: row.score,
          status: 'APPROVED' as const,
          submittedByRole: 'DIVISION' as const,
          approvedByUserId: session.user.id,
          approvedAt: new Date(),
        };

        if (existing) {
          await tx.activity.update({ where: { id: existing.id }, data });
          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              entity: 'Activity',
              entityId: existing.id,
              label: `${row.staffLabel} — ${type.label}`,
              userId: session.user.id,
              changes: diffChanges(
                {
                  score: existing.score,
                  evidence: summarizeEvidence(specs.fields, existing.evidence),
                },
                { score: row.score, evidence: row.summary }
              ),
            },
          });
        } else {
          const created = await tx.activity.create({
            data: { staffId: row.staffId, activityTypeId: type.id, year, ...data },
          });
          await tx.auditLog.create({
            data: {
              action: 'CREATE',
              entity: 'Activity',
              entityId: created.id,
              label: `${row.staffLabel} — ${type.label}`,
              userId: session.user.id,
              changes: diffChanges(
                {},
                { year, score: row.score, status: 'APPROVED', evidence: row.summary }
              ),
            },
          });
        }

        await recomputeRatingEntry(tx, row.staffId, year);
      }
    });

  try {
    await saveAll();
  } catch (e) {
    if (!isUniqueViolation(e)) {
      return { error: parseDbError(e, 'Помилка при внесенні даних') };
    }
    try {
      await saveAll();
    } catch (retryError) {
      return { error: parseDbError(retryError, 'Помилка при внесенні даних') };
    }
  }

  revalidatePath('/division-data');
  return { success: true, saved: prepared.length };
}
