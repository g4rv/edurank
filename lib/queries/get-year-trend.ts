import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { summarise, TREND_YEARS, type YearPoint } from '@/lib/dashboard/trend';

/**
 * The total and the median of every rating year, oldest first — at most
 * `TREND_YEARS` of the newest, so the line never grows past a readable width.
 *
 * An OPEN year counts whoever is on the roster now (nobody scored is a zero, as
 * the figure cards count them). A CLOSED year is frozen history and keeps
 * whoever scored in it, archived or not — the same split `listRatings` makes.
 */
export async function getYearTrend(): Promise<YearPoint[]> {
  const templates = await db.ratingTemplate.findMany({
    orderBy: { year: 'desc' },
    take: TREND_YEARS,
    select: { year: true, status: true },
  });

  const points = await Promise.all(
    templates.map(async ({ year, status }) => {
      if (status === 'CLOSED') {
        const entries = await db.ratingEntry.findMany({
          where: { year, staff: { isNpp: true } },
          select: { totalScore: true },
        });
        return summarise(
          year,
          entries.map((e) => e.totalScore)
        );
      }
      const people = await db.staff.findMany({
        where: { ...ON_ROSTER, isNpp: true },
        select: { ratingEntries: { where: { year }, select: { totalScore: true } } },
      });
      return summarise(
        year,
        people.map((p) => p.ratingEntries[0]?.totalScore ?? 0)
      );
    })
  );

  return points.sort((a, b) => a.year - b.year);
}
