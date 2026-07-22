import { describe, expect, it } from 'vitest';
import { bandScores } from './get-dashboard';

describe('bandScores', () => {
  it('returns nothing when there is nothing to band', () => {
    expect(bandScores([])).toEqual([]);
    expect(bandScores([0, 0, 0])).toEqual([]);
  });

  it('rounds the band width up to a readable step', () => {
    // top 9 000 → 900 per band raw → 1 000
    const bands = bandScores([0, 500, 1500, 9000]);
    expect(bands[0]).toEqual({ from: 0, to: 1000, count: 2 });
    expect(bands).toHaveLength(9);
  });

  it('closes the last band so the top score is counted', () => {
    const bands = bandScores([9000]);
    const last = bands[bands.length - 1];
    expect(last.to).toBe(9000);
    expect(last.count).toBe(1);
  });

  it('keeps empty bands, so a gap below the leaders stays visible', () => {
    const bands = bandScores([100, 200, 300, 10000]);
    const empty = bands.filter((b) => b.count === 0);
    expect(empty.length).toBeGreaterThan(0);
    expect(bands.reduce((acc, b) => acc + b.count, 0)).toBe(4);
  });

  it('counts every score exactly once', () => {
    const totals = [0, 1, 999, 1000, 1001, 4999, 5000];
    const bands = bandScores(totals);
    expect(bands.reduce((acc, b) => acc + b.count, 0)).toBe(totals.length);
  });
});
