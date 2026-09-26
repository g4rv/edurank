/** The five section columns of a `RatingEntry`, plus its stored total. */
export interface SectionScoreRow {
  section1Score: number;
  section2Score: number;
  section3Score: number;
  section4Score: number;
  section5Score: number;
  totalScore: number;
}

export interface SectionTotals {
  /** Five scores, section 1 first */
  sections: number[];
  total: number;
}

/**
 * `RatingEntry`'s five numbered columns as an ordered array.
 *
 * The columns are `section1Score … section5Score` rather than a list, because
 * the rating has had exactly five sections since 2026 and a column apiece is
 * what makes «ORDER BY section3Score» possible on the rollup. Every reader
 * therefore has to spell the five out, and each one that does it by hand is a
 * chance to put Розділ 4 where Розділ 5 belongs — silently, since all five are
 * plausible numbers.
 *
 * **`null` when there is no entry, never five zeros.** Nobody has a row until
 * their first submission is scored, and «0 0 0 0 0» in the nav would read as a
 * record that has been counted and came to nothing, which is a different claim
 * from «nothing submitted yet». A zero INSIDE a real entry is kept — §5 of
 * `docs/aurora.md`: «a rating section scoring 0 keeps its row, because that gap
 * is the point».
 *
 * **The total is read, not re-added.** Summing the five here would hide a
 * recompute bug rather than show it, and `recompute.ts` is the one place
 * allowed to decide what a year adds up to.
 */
export function sectionScores(entry: SectionScoreRow): SectionTotals;
export function sectionScores(entry: SectionScoreRow | null): SectionTotals | null;
export function sectionScores(entry: SectionScoreRow | null): SectionTotals | null {
  if (!entry) return null;
  return {
    sections: [
      entry.section1Score,
      entry.section2Score,
      entry.section3Score,
      entry.section4Score,
      entry.section5Score,
    ],
    total: entry.totalScore,
  };
}
