import { db } from '@/lib/db';

// Which year's rating the ставки are spread on.
//
// **Two different years, and the code used to use one.** The ставки being
// handed out are for the CURRENT year; the work they reward was done in the
// PREVIOUS one. Spreading 2026's pool by 2026's rating rewards work nobody has
// finished yet — everybody's score is a few months old and the кафедра is
// ranked on an accident of who submitted early.
//
// A rule rather than a setting, deliberately. Anything the browser sends could
// disagree with what the server recomputes on save, and `saveDistribution`
// stores «за формулою» beside the head's number — so a view-only picker would
// show one split and file another. Both sides run this instead and cannot
// disagree.

/**
 * The newest template year before `stakeYear` that has ratings in it, or
 * `stakeYear` when there is no such year.
 *
 * **«Has ratings», not «exists».** A template can be created long before
 * anything is scored against it — an imported year is exactly that for a
 * while — and picking an empty year hands every person a rating of zero, which
 * collapses the whole distribution into equal shares. Checking for a single
 * `RatingEntry` costs one query and keeps the answer honest until the data
 * arrives, at which point the rule starts using it on its own.
 *
 * Falling back to `stakeYear` is the old behaviour, so a university with only
 * one year of history sees exactly what it saw before.
 */
export async function ratingYearFor(stakeYear: number): Promise<number> {
  const earlier = await db.ratingTemplate.findMany({
    where: { year: { lt: stakeYear } },
    select: { year: true },
    orderBy: { year: 'desc' },
  });
  if (earlier.length === 0) return stakeYear;

  const scored = await db.ratingEntry.findMany({
    where: { year: { in: earlier.map((t) => t.year) } },
    select: { year: true },
    distinct: ['year'],
  });
  if (scored.length === 0) return stakeYear;

  // `earlier` is already newest-first, so the first one with any score wins
  const withScores = new Set(scored.map((e) => e.year));
  return earlier.find((t) => withScores.has(t.year))?.year ?? stakeYear;
}
