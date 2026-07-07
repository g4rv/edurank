import type { Prisma } from '@/lib/generated/prisma/client';

// Rolls approved activity scores up into the cached RatingEntry for one staff/year.
// Called inside the same transaction as the mutation that changed the activities
// (submit, discard, division entry) so the rollup never drifts from the rows.

export interface SectionScoreRow {
  score: number;
  sectionNumber: number;
}

export interface SectionTotals {
  section1Score: number;
  section2Score: number;
  section3Score: number;
  section4Score: number;
  section5Score: number;
  totalScore: number;
}

/** Pure rollup: sums scores into the five section buckets (unknown sections are ignored) */
export function sumBySection(rows: SectionScoreRow[]): SectionTotals {
  const sections = [0, 0, 0, 0, 0];
  for (const row of rows) {
    if (row.sectionNumber >= 1 && row.sectionNumber <= 5) {
      sections[row.sectionNumber - 1] += row.score;
    }
  }
  const [section1Score, section2Score, section3Score, section4Score, section5Score] = sections;
  return {
    section1Score,
    section2Score,
    section3Score,
    section4Score,
    section5Score,
    totalScore: sections.reduce((a, b) => a + b, 0),
  };
}

/** Recomputes and upserts the RatingEntry for one staff/year from APPROVED activities */
export async function recomputeRatingEntry(
  tx: Prisma.TransactionClient,
  staffId: string,
  year: number
): Promise<SectionTotals> {
  const activities = await tx.activity.findMany({
    where: { staffId, year, status: 'APPROVED' },
    select: { score: true, activityType: { select: { section: { select: { number: true } } } } },
  });

  const totals = sumBySection(
    activities.map((a) => ({ score: a.score, sectionNumber: a.activityType.section.number }))
  );

  await tx.ratingEntry.upsert({
    where: { staffId_year: { staffId, year } },
    create: { staffId, year, ...totals },
    update: totals,
  });

  return totals;
}
