import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { topPerMetric, type StaffScores, type TopByMetric } from '@/lib/dashboard/top-staff';

/**
 * The НПП with the most points in `year` — by the total and by each розділ,
 * highest first. One read of the year's entries; the six lists are cut in
 * memory (`topPerMetric`), so the card's select never asks the server again.
 *
 * An OPEN year counts the current roster; a CLOSED one is frozen history and
 * keeps whoever scored in it (the split `getYearTrend` makes too).
 */
export async function getTopStaff(year: number): Promise<TopByMetric> {
  const template = await db.ratingTemplate.findUnique({
    where: { year },
    select: { status: true },
  });
  const closed = template?.status === 'CLOSED';

  const entries = await db.ratingEntry.findMany({
    // Nobody with nothing at all belongs on a «top»
    where: { year, totalScore: { gt: 0 }, staff: { isNpp: true, ...(closed ? {} : ON_ROSTER) } },
    select: {
      section1Score: true,
      section2Score: true,
      section3Score: true,
      section4Score: true,
      section5Score: true,
      totalScore: true,
      staff: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          patronymic: true,
          department: { select: { name: true, faculty: { select: { name: true } } } },
          partTimeDepartments: {
            take: 1,
            select: { department: { select: { name: true, faculty: { select: { name: true } } } } },
          },
        },
      },
    },
  });

  const people: StaffScores[] = entries.map((e) => {
    const home = e.staff.department ?? e.staff.partTimeDepartments[0]?.department ?? null;
    return {
      id: e.staff.id,
      name: `${e.staff.lastName} ${e.staff.firstName} ${e.staff.patronymic}`.trim(),
      department: home?.name ?? null,
      faculty: home?.faculty.name ?? null,
      sections: [
        e.section1Score,
        e.section2Score,
        e.section3Score,
        e.section4Score,
        e.section5Score,
      ],
      total: e.totalScore,
    };
  });

  return topPerMetric(people);
}
