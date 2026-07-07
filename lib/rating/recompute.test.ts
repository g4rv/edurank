import { describe, expect, it } from 'vitest';
import { sumBySection } from './recompute';

describe('sumBySection', () => {
  it('sums scores into their section buckets', () => {
    const totals = sumBySection([
      { score: 50, sectionNumber: 1 },
      { score: 30, sectionNumber: 1 },
      { score: 600, sectionNumber: 3 },
      { score: 150, sectionNumber: 5 },
    ]);
    expect(totals).toEqual({
      section1Score: 80,
      section2Score: 0,
      section3Score: 600,
      section4Score: 0,
      section5Score: 150,
      totalScore: 830,
    });
  });

  it('returns zeros for no activities', () => {
    expect(sumBySection([]).totalScore).toBe(0);
  });

  it('ignores unknown section numbers', () => {
    const totals = sumBySection([
      { score: 10, sectionNumber: 0 },
      { score: 10, sectionNumber: 6 },
      { score: 10, sectionNumber: 2 },
    ]);
    expect(totals.section2Score).toBe(10);
    expect(totals.totalScore).toBe(10);
  });

  it('removal is reflected by summing only what remains', () => {
    const before = sumBySection([
      { score: 40, sectionNumber: 2 },
      { score: 40, sectionNumber: 2 },
    ]);
    const after = sumBySection([{ score: 40, sectionNumber: 2 }]);
    expect(before.section2Score - after.section2Score).toBe(40);
  });
});
