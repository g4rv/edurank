import { describe, expect, it } from 'vitest';
import { axisTicks } from './pdf-chart';

describe('axisTicks', () => {
  it('starts at zero, so bar length stays proportional to the value', () => {
    expect(axisTicks(3137)[0]).toBe(0);
  });

  it('reaches past the largest value, so the longest bar fits', () => {
    for (const max of [953, 3137, 8752, 12, 1_000_000]) {
      const ticks = axisTicks(max);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it('uses round steps a reader recognises', () => {
    // 1 / 2 / 5 × a power of ten — never 3 или 7
    for (const max of [953, 3137, 8752, 47, 1_000_000]) {
      const ticks = axisTicks(max);
      const step = ticks[1] - ticks[0];
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5, 10]).toContain(Math.round(mantissa));
    }
  });

  it('keeps the tick count in a readable range', () => {
    for (const max of [953, 3137, 8752, 47, 999_999]) {
      const ticks = axisTicks(max);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(12);
    }
  });

  it('survives an empty year, where every score is zero', () => {
    expect(axisTicks(0)).toEqual([0]);
  });
});
