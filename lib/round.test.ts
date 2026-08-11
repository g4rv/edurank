import { describe, expect, it } from 'vitest';
import { round2, sumScores } from './round';

describe('round2', () => {
  it('cuts binary dust to two decimals', () => {
    expect(round2(884.1700000000001)).toBe(884.17);
    expect(round2(0.30000000000000004)).toBe(0.3);
  });

  it('leaves a clean number alone', () => {
    expect(round2(884.17)).toBe(884.17);
    expect(round2(0)).toBe(0);
    expect(round2(600)).toBe(600);
  });

  it('keeps the sign', () => {
    expect(round2(-0.905)).toBe(-0.9);
  });
});

describe('sumScores', () => {
  // The exact figure that appeared in the Розділ 2 subtotal on a staff rating
  // page: two stored scores, each already clean, whose sum is not.
  it('produces 884,17 rather than 884,1700000000001', () => {
    expect(sumScores([404.17, 480])).toBe(884.17);
  });

  it('holds up across a whole section', () => {
    expect(sumScores([10, 404.17, 300, 100, 70])).toBe(884.17);
  });

  it('is zero for nothing', () => {
    expect(sumScores([])).toBe(0);
  });

  // The property that matters: rounding at the END, never per item. Rounding
  // each value first is how a set of small scores loses a whole point.
  it('rounds once at the end, not per value', () => {
    const thirds = Array.from({ length: 9 }, () => 0.005);
    expect(sumScores(thirds)).toBe(0.05);
    expect(thirds.map(round2).reduce((a, b) => a + b, 0)).toBe(0.09);
  });
});
