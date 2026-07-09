'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { canActForDivision } from '@/lib/permissions';
import { activityTypeMeta, summarizeEvidence } from '@/lib/rating/registry';
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

  let meta: ReturnType<typeof activityTypeMeta>;
  try {
    meta = activityTypeMeta(type.code);
  } catch {
    return { error: 'Невідомий показник' };
  }

  const parsed = meta.schema.safeParse(evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const year = type.template.year;
  const { computedValue, score } = computeScore(type.code, parsed.data, type.coefficient);
  const evidenceSummary = summarizeEvidence(type.code, parsed.data);
  const staffLabel = `${staff.lastName} ${staff.firstName} ${staff.patronymic}`;

  try {
    await db.$transaction(async (tx) => {
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
                evidence: summarizeEvidence(type.code, existing.evidence),
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
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при внесенні даних') };
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
