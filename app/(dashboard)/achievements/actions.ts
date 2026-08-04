'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { parseTypeSpecs } from '@/validations/activity-type-spec';
import { recomputeRatingEntry } from '@/lib/rating/recompute';
import { computeScore } from '@/lib/rating/scoring';
import { logError } from '@/lib/log';

export type CreateActivityState = { error: string } | { success: true; score: number };

// Sentinel for the in-transaction «не більше N» cap check
class CapExceededError extends Error {
  constructor(public readonly cap: number) {
    super('cap exceeded');
  }
}

export async function createActivity(
  activityTypeId: string,
  evidence: unknown
): Promise<CreateActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  // NPP self-report only: USER role submitting for their own staff record
  const staffId = session.user.staffId;
  if (session.user.role !== 'USER' || !staffId) return { error: 'Недостатньо прав' };

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, archivedAt: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff?.isNpp) return { error: 'Подання досягнень доступне лише для НПП' };
  // Archiving blocks the login, so this is only reachable with a session that
  // was already open — belt and braces on the year's numbers.
  if (staff.archivedAt) return { error: 'Ваш запис архівовано' };

  const type = await db.activityType.findUnique({
    where: { id: activityTypeId },
    select: {
      id: true,
      code: true,
      label: true,
      coefficient: true,
      inputSource: true,
      isActive: true,
      maxPerYear: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true, isActive: true, status: true } },
    },
  });
  if (!type || !type.isActive || type.inputSource !== 'NPP_SUBMISSION') {
    return { error: 'Цей показник недоступний для самостійного подання' };
  }
  if (!type.template.isActive || type.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито для подання' };
  }

  let specs: ReturnType<typeof parseTypeSpecs>;
  try {
    specs = parseTypeSpecs(type);
  } catch (e) {
    // Malformed evidenceFields/scoring JSON on the row — a broken indicator, not
    // a user mistake. Without this the admin only hears «Невідомий показник».
    logError('achievements.parseSpecs', e, { entityId: type.id, code: type.code });
    return { error: 'Невідомий показник' };
  }

  const parsed = specs.schema.safeParse(evidence);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  // Never trust the client for the year — it comes from the type's template
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

  try {
    await db.$transaction(async (tx) => {
      const cap = type.maxPerYear;
      if (cap) {
        const existing = await tx.activity.count({
          where: { staffId, activityTypeId: type.id, year, status: { not: 'REMOVED' } },
        });
        if (existing >= cap) throw new CapExceededError(cap);
      }

      const activity = await tx.activity.create({
        data: {
          staffId,
          activityTypeId: type.id,
          year,
          evidence: parsed.data as Prisma.InputJsonValue,
          computedValue,
          score,
          status: 'APPROVED', // auto-approved on submit; ННВ/ADMIN can discard later
          submittedByRole: 'NPP',
          approvedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Activity',
          entityId: activity.id,
          label: `${staff.lastName} ${staff.firstName} ${staff.patronymic} — ${type.label}`,
          userId: session.user.id,
          changes: diffChanges(
            {},
            {
              year,
              score,
              status: 'APPROVED',
              evidence: summarizeEvidence(specs.fields, parsed.data),
            }
          ),
        },
      });

      await recomputeRatingEntry(tx, staffId, year);
    });
  } catch (e) {
    if (e instanceof CapExceededError) {
      return { error: `Не більше ${e.cap} подань цього показника на рік` };
    }
    return {
      error: parseDbError(e, 'Помилка при поданні досягнення', 'achievements.createActivity', {
        userId: session.user.id,
      }),
    };
  }

  revalidatePath('/achievements');
  return { success: true, score };
}

export type DeleteActivityState = { error: string } | { success: true };

// An NPP removes their OWN self-report (a mistake). Hard delete + audit, matching the
// deleteStaff pattern. Division-entered rows and moderated (REMOVED) rows are off-limits;
// discarding those is the ННВ/ADMIN job (M4).
export async function deleteActivity(activityId: string): Promise<DeleteActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (session.user.role !== 'USER' || !staffId) return { error: 'Недостатньо прав' };

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
        select: { code: true, label: true, template: { select: { status: true } } },
      },
    },
  });

  if (!activity || activity.staffId !== staffId) return { error: 'Досягнення не знайдено' };
  if (activity.submittedByRole !== 'NPP' || activity.status !== 'APPROVED') {
    return { error: 'Це досягнення не можна видалити' };
  }
  if (activity.activityType.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.activity.delete({ where: { id: activity.id } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Activity',
          entityId: activity.id,
          label: `${activity.activityType.label}`,
          userId: session.user.id,
          changes: diffChanges({ score: activity.score, status: activity.status }, {}),
        },
      });

      await recomputeRatingEntry(tx, staffId, activity.year);
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Помилка при видаленні', 'achievements.deleteActivity', {
        userId: session.user.id,
      }),
    };
  }

  revalidatePath('/achievements');
  return { success: true };
}
