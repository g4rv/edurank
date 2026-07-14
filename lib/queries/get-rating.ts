import { db } from '@/lib/db';

/** Cached section totals for one staff member and year (null = no entry yet) */
export async function getRatingEntry(staffId: string, year: number) {
  return db.ratingEntry.findUnique({
    where: { staffId_year: { staffId, year } },
    select: {
      section1Score: true,
      section2Score: true,
      section3Score: true,
      section4Score: true,
      section5Score: true,
      totalScore: true,
      updatedAt: true,
    },
  });
}

export type RatingEntrySummary = NonNullable<Awaited<ReturnType<typeof getRatingEntry>>>;
