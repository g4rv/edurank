import { db } from '@/lib/db';

/** Activities of one staff member for one year, newest first (all statuses); optionally one section */
export async function listStaffActivities(staffId: string, year: number, section?: number) {
  return db.activity.findMany({
    where: {
      staffId,
      year,
      ...(section ? { activityType: { section: { number: section } } } : {}),
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
          section: { select: { number: true, title: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export type StaffActivity = Awaited<ReturnType<typeof listStaffActivities>>[number];

/** Activities grouped by section number 1–5 (sections without entries are omitted) */
export function groupActivitiesBySection(activities: StaffActivity[]) {
  const groups = new Map<number, { title: string; activities: StaffActivity[] }>();
  for (const activity of activities) {
    const { number, title } = activity.activityType.section;
    const group = groups.get(number) ?? { title, activities: [] };
    group.activities.push(activity);
    groups.set(number, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, group]) => ({ number, ...group }));
}
