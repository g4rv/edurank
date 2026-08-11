'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { canModerateRating } from '@/lib/rating/moderation';
import { recomputeRatingEntry } from '@/lib/rating/recompute';
import { evidenceItems, type EvidenceItem } from '@/lib/rating/evidence-detail';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { fullStaffName } from '@/lib/staff-name';

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
    return {
      error: parseDbError(
        e,
        'Не вдалося відхилити. Зміни не застосовано',
        'moderation.removeActivity',
        {
          userId: session.user.id,
        }
      ),
    };
  }

  revalidatePath('/moderation');
  revalidatePath('/achievements');
  return { success: true };
}

export type VerifyActivityState = { error: string } | { success: true; verified: boolean };

// Manual «Перевірено» check on a publication self-report (M9.1): ННВ editor or
// ADMIN toggles it after checking the publication in WoS/Scopus. Informational —
// does not change scores; a future DOI-checker may pre-fill it.
export async function setActivityVerified(
  activityId: string,
  verified: boolean
): Promise<VerifyActivityState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canModerateRating(session.user))) return { error: 'Недостатньо прав' };

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      status: true,
      verifiedAt: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
      activityType: {
        select: {
          requiresVerification: true,
          label: true,
          template: { select: { status: true } },
        },
      },
    },
  });

  if (!activity) return { error: 'Запис не знайдено' };
  if (!activity.activityType.requiresVerification) {
    return { error: 'Цей показник не потребує перевірки' };
  }
  if (activity.status !== 'APPROVED') return { error: 'Запис не підтверджено' };
  if (activity.activityType.template.status !== 'OPEN') {
    return { error: 'Рейтинговий рік закрито' };
  }

  const wasVerified = activity.verifiedAt !== null;
  if (wasVerified === verified) return { success: true, verified };

  try {
    await db.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activity.id },
        data: verified
          ? { verifiedAt: new Date(), verifiedByUserId: session.user.id }
          : { verifiedAt: null, verifiedByUserId: null },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Activity',
          entityId: activity.id,
          label: `${activity.staff.lastName} ${activity.staff.firstName} ${activity.staff.patronymic} — ${activity.activityType.label}`,
          userId: session.user.id,
          changes: diffChanges({ verified: wasVerified }, { verified }),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'moderation.setActivityVerified',
        {
          userId: session.user.id,
        }
      ),
    };
  }

  revalidatePath('/moderation');
  return { success: true, verified };
}

// ─── Detail panel ────────────────────────────────────────────────────────────

export interface SubmissionDetail {
  id: string;
  staffName: string;
  staffId: string;
  department: string;
  itemNumber: string;
  label: string;
  section: number;
  sectionTitle: string;
  score: number;
  statusLabel: string;
  status: 'PENDING' | 'APPROVED' | 'REMOVED';
  removeReason: string | null;
  date: string;
  verified: boolean;
  verifiedAt: string | null;
  items: EvidenceItem[];
}

export type SubmissionDetailState = { error: string } | { detail: SubmissionDetail };

/**
 * Everything about one submission, for the side panel.
 *
 * Loaded per record rather than sent with the table: a year holds thousands of
 * rows and their evidence is the biggest thing on each one, so shipping it all
 * to render a list nobody reads in full would be paid on every page load.
 *
 * Read-only, but still permission-checked — a query that returns what somebody
 * wrote about themselves is not public just because it changes nothing.
 */
export async function getSubmissionDetail(activityId: string): Promise<SubmissionDetailState> {
  const session = await auth();
  if (!session) redirect('/login');
  if (!(await canModerateRating(session.user))) return { error: 'Недостатньо прав' };

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      evidence: true,
      score: true,
      status: true,
      removeReason: true,
      createdAt: true,
      verifiedAt: true,
      staff: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          patronymic: true,
          department: { select: { name: true } },
        },
      },
      activityType: {
        select: {
          label: true,
          itemNumber: true,
          evidenceFields: true,
          section: { select: { number: true, title: true } },
        },
      },
    },
  });
  if (!activity) return { error: 'Запис не знайдено' };

  const parsed = evidenceFieldsSpecSchema.safeParse(activity.activityType.evidenceFields);

  return {
    detail: {
      id: activity.id,
      staffName: fullStaffName(activity.staff),
      staffId: activity.staff.id,
      department: activity.staff.department?.name ?? '',
      itemNumber: activity.activityType.itemNumber,
      label: activity.activityType.label,
      section: activity.activityType.section.number,
      sectionTitle: activity.activityType.section.title,
      score: activity.score,
      status: activity.status,
      statusLabel: ACTIVITY_STATUS_LABELS[activity.status],
      removeReason: activity.removeReason,
      date: activity.createdAt.toLocaleDateString('uk-UA'),
      verified: activity.verifiedAt !== null,
      verifiedAt: activity.verifiedAt?.toLocaleDateString('uk-UA') ?? null,
      items: evidenceItems(parsed.success ? parsed.data : [], activity.evidence),
    },
  };
}
