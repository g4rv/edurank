import { db } from '@/lib/db';

/**
 * NPP self-reports for the oversight panel: one year, newest first.
 * Includes APPROVED (discardable) and REMOVED (already moderated) for context.
 */
export async function listNppActivities(year: number, section?: number) {
  return db.activity.findMany({
    where: {
      year,
      submittedByRole: 'NPP',
      status: { in: ['APPROVED', 'REMOVED'] },
      ...(section ? { activityType: { section: { number: section } } } : {}),
    },
    select: {
      id: true,
      evidence: true,
      score: true,
      status: true,
      removeReason: true,
      verifiedAt: true,
      createdAt: true,
      staff: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          patronymic: true,
          department: { select: { name: true, faculty: { select: { name: true } } } },
        },
      },
      activityType: {
        select: {
          code: true,
          label: true,
          itemNumber: true,
          evidenceFields: true,
          section: { select: { number: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export type NppActivity = Awaited<ReturnType<typeof listNppActivities>>[number];
