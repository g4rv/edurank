import { describe, expect, it } from 'vitest';
import { sectionScores } from './section-scores';

describe('sectionScores', () => {
  it('reads the five columns in section order', () => {
    // Deliberately all different, and ascending, so a swapped pair or an
    // off-by-one shows up as a wrong ORDER rather than a wrong sum.
    expect(
      sectionScores({
        section1Score: 1,
        section2Score: 2,
        section3Score: 3,
        section4Score: 4,
        section5Score: 5,
        totalScore: 15,
      })
    ).toEqual({ sections: [1, 2, 3, 4, 5], total: 15 });
  });

  it('keeps a zero section', () => {
    // §5: «a rating section scoring 0 keeps its row, because that gap is the
    // point». A missing number here would read as «not counted yet».
    const { sections } = sectionScores({
      section1Score: 240,
      section2Score: 0,
      section3Score: 1150,
      section4Score: 150,
      section5Score: 80,
      totalScore: 1620,
    });
    expect(sections).toEqual([240, 0, 1150, 150, 80]);
  });

  it('is null when the person has no entry for the year', () => {
    // Nobody has an entry before their first submission, and the nav must not
    // print five zeros that look like a scored record of nothing.
    expect(sectionScores(null)).toBeNull();
  });

  it('does not invent a total from the parts', () => {
    // The stored total is authoritative. Re-adding the columns here would
    // quietly paper over a recompute bug instead of showing it.
    expect(
      sectionScores({
        section1Score: 10,
        section2Score: 10,
        section3Score: 0,
        section4Score: 0,
        section5Score: 0,
        totalScore: 999,
      }).total
    ).toBe(999);
  });
});
