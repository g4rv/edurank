'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { canModerateRating } from '@/lib/rating/moderation';
import { recomputeRatingEntry } from '@/lib/rating/recompute';

export type RemoveActivityState = { error: string } | { success: true };

// ННВ editor or ADMIN discards a wrong NPP self-report: soft REMOVE with a
// required reason the NPP will see. Score leaves the rating; the NPP may resubmit.
export async function removeActivity(
  activityId: string,
  reason: string
): Promise<RemoveActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canModerateRating(session.user))) return { error: 'Недостатньо прав' };

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: 'Вкажіть причину відхилення' };
  if (trimmedReason.length > 500) return { error: 'Причина занадто довга (до 500 символів)' };

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
        select: { label: true, template: { select: { status: true } } },
      },
    },
  });

  if (!activity) return { error: 'Досягнення не знайдено' };
  if (activity.submittedByRole !== 'NPP' || activity.status !== 'APPROVED') {
    return { error: 'Це досягнення не можна відхилити' };
  }
  if (activity.activityType.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activity.id },
        data: {
          status: 'REMOVED',
          removedByUserId: session.user.id,
          removedAt: new Date(),
          removeReason: trimmedReason,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Activity',
          entityId: activity.id,
          label: activity.activityType.label,
          userId: session.user.id,
          changes: diffChanges(
            { status: activity.status, removeReason: null },
            { status: 'REMOVED', removeReason: trimmedReason }
          ),
        },
      });

      await recomputeRatingEntry(tx, activity.staffId, activity.year);
    });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при відхиленні') };
  }

  revalidatePath('/moderation');
  revalidatePath('/achievements');
  return { success: true };
}
