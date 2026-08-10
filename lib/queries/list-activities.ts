import { db } from '@/lib/db';

/**
 * Activities of one staff member for one year, newest first (all statuses);
 * optionally one section. Deactivated indicators are excluded so the table
 * subtotals match the RatingEntry that `recomputeRatingEntry` writes.
 */
export async function listStaffActivities(staffId: string, year: number, section?: number) {
  return db.activity.findMany({
    where: {
      staffId,
      year,
      activityType: { isActive: true, ...(section ? { section: { number: section } } : {}) },
    },
    select: {
      id: true,
      evidence: true,
      computedValue: true,
      score: true,
      status: true,
      submittedByRole: true,
      removeReason: true,
      createdAt: true,
      activityType: {
        select: {
          id: true,
          code: true,
          label: true,
          itemNumber: true,
          inputSource: true,
          // Named on the row so «this number is wrong» has an addressee
          verifyingDivision: { select: { name: true, registryKey: true } },
          evidenceFields: true,
          section: { select: { number: true, title: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export type StaffActivity = Awaited<ReturnType<typeof listStaffActivities>>[number];
