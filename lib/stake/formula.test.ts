import { describe, it, expect } from 'vitest';
import { DEFAULT_LIMITS, formulaShares, type FormulaPerson } from './formula';

function person(staffId: string, rating: number, limits?: Partial<FormulaPerson>): FormulaPerson {
  return { staffId, rating, ...DEFAULT_LIMITS, ...limits };
}

/** Everyone equal — the simplest case to reason about */
const EVEN = [person('a', 1000), person('b', 1000), person('c', 1000), person('d', 1000)];

describe('formulaShares', () => {
  it('gives identical ratings identical shares', () => {
    const { shares } = formulaShares({ people: EVEN, kstHundredths: 400, knpp: 2 });
    expect(new Set(shares.map((s) => s.hundredths)).size).toBe(1);
  });

  it('scales with the person’s rating', () => {
    const people = [person('high', 3000), person('low', 1000)];
    const { shares } = formulaShares({ people, kstHundredths: 400, knpp: 2 });
    const high = shares.find((s) => s.staffId === 'high')!;
    const low = shares.find((s) => s.staffId === 'low')!;
    // Three times the rating, three times the raw share
    expect(high.rawHundredths).toBeCloseTo(low.rawHundredths * 3, 6);
  });

  it('computes 0.5 · (R/<R>) · (Кст/Кнпп)', () => {
    // <R> = 1000, Кст = 4.00, Кнпп = 2 → 0.5 × 1 × 200 = 100 hundredths = 1.00
    const { shares } = formulaShares({ people: EVEN, kstHundredths: 400, knpp: 2 });
    expect(shares[0].rawHundredths).toBeCloseTo(100, 6);
    expect(shares[0].hundredths).toBe(100);
  });

  it('lands every share on the 0.05 ladder', () => {
    const people = [person('a', 1234), person('b', 987), person('c', 4321)];
    const { shares } = formulaShares({ people, kstHundredths: 273, knpp: 2 });
    for (const s of shares) expect(s.hundredths % 5).toBe(0);
  });
});

describe('the pool is not generally exhausted — a property of the formula', () => {
  // Σ(R/<R>) is exactly the headcount, so the untouched total comes to
  // 0.5 × N / Кнпп × Кст. The head closes the gap by hand.
  it('spends the whole pool exactly when Кнпп is half the headcount', () => {
    const { totalHundredths } = formulaShares({ people: EVEN, kstHundredths: 400, knpp: 2 });
    expect(totalHundredths).toBe(400);
  });

  it('leaves some of it when Кнпп is more than half', () => {
    const { totalHundredths } = formulaShares({ people: EVEN, kstHundredths: 400, knpp: 4 });
    expect(totalHundredths).toBeLessThan(400);
  });

  it('OVERSPENDS when Кнпп is less than half — the grid must show this', () => {
    // 18 people, Кнпп 8, as on Кафедра вищої математики: factor 1.125
    const people = Array.from({ length: 18 }, (_, i) => person(`s${i}`, 1000));
    const { totalHundredths } = formulaShares({ people, kstHundredths: 400, knpp: 8 });
    expect(totalHundredths).toBeGreaterThan(400);
  });
});

describe('per-person limits', () => {
  it('clamps a high earner down to their cap and says so', () => {
    const people = [person('star', 10000, { maxHundredths: 100 }), person('rest', 1000)];
    const { shares } = formulaShares({ people, kstHundredths: 400, knpp: 2 });
    const star = shares.find((s) => s.staffId === 'star')!;
    expect(star.hundredths).toBe(100);
    expect(star.clampedTo).toBe('max');
  });

  it('lifts a low earner up to their floor and says so', () => {
    const people = [person('star', 100000), person('quiet', 1)];
    const { shares } = formulaShares({ people, kstHundredths: 400, knpp: 2 });
    const quiet = shares.find((s) => s.staffId === 'quiet')!;
    expect(quiet.hundredths).toBe(DEFAULT_LIMITS.minHundredths);
    expect(quiet.clampedTo).toBe('min');
  });

  it('reports no clamping when the raw value survives', () => {
    const { shares } = formulaShares({ people: EVEN, kstHundredths: 400, knpp: 2 });
    expect(shares.every((s) => s.clampedTo === null)).toBe(true);
  });

  it('never rounds anybody below the absolute 0.1 floor', () => {
    const people = [person('star', 100000), person('quiet', 1)];
    const { shares } = formulaShares({ people, kstHundredths: 20, knpp: 10 });
    for (const s of shares) expect(s.hundredths).toBeGreaterThanOrEqual(10);
  });

  it('never rounds a share above a cap that is off the ladder', () => {
    // A cap of 0.72 must not become 0.75 through snapping. The cap wins and
    // the share steps down to 0.70 — on the ladder and under the cap.
    const people = [person('capped', 100000, { maxHundredths: 72 }), person('rest', 1)];
    const { shares } = formulaShares({ people, kstHundredths: 400, knpp: 2 });
    const capped = shares.find((s) => s.staffId === 'capped')!;
    expect(capped.hundredths).toBeLessThanOrEqual(72);
    expect(capped.hundredths).toBe(70);
  });

  it('never rounds a share below a floor that is off the ladder', () => {
    const people = [person('floored', 1, { minHundredths: 22 }), person('star', 100000)];
    const { shares } = formulaShares({ people, kstHundredths: 400, knpp: 2 });
    const floored = shares.find((s) => s.staffId === 'floored')!;
    expect(floored.hundredths).toBeGreaterThanOrEqual(22);
    expect(floored.hundredths).toBe(25);
  });

  it('lets the absolute 0.1 floor outrank a lower per-person minimum', () => {
    const people = [person('a', 1, { minHundredths: 0 }), person('b', 100000)];
    const { shares } = formulaShares({ people, kstHundredths: 400, knpp: 2 });
    // No route to zero exists — not through a cap, not through the formula
    expect(shares.find((s) => s.staffId === 'a')!.hundredths).toBe(10);
  });

  it('defaults are 0.1 and 1.5', () => {
    expect(DEFAULT_LIMITS).toEqual({ minHundredths: 10, maxHundredths: 150 });
  });
});

describe('cases the formula cannot evaluate', () => {
  it('is not computable when Кнпп is zero, and everyone lands on their floor', () => {
    // Nobody on the кафедра meets four of the twenty licence positions
    const result = formulaShares({ people: EVEN, kstHundredths: 400, knpp: 0 });
    expect(result.computable).toBe(false);
    // A division by zero would otherwise make every share Infinity
    expect(result.shares.every((s) => s.hundredths === 10)).toBe(true);
  });

  it('is not computable when nobody has any rating', () => {
    const people = [person('a', 0), person('b', 0)];
    const result = formulaShares({ people, kstHundredths: 400, knpp: 1 });
    expect(result.computable).toBe(false);
    expect(result.shares.every((s) => Number.isFinite(s.hundredths))).toBe(true);
  });

  it('handles an empty кафедра', () => {
    const result = formulaShares({ people: [], kstHundredths: 400, knpp: 0 });
    expect(result).toMatchObject({ computable: false, totalHundredths: 0 });
    expect(result.shares).toEqual([]);
  });

  it('gives everyone their floor when the pool is zero', () => {
    const { shares } = formulaShares({ people: EVEN, kstHundredths: 0, knpp: 2 });
    expect(shares.every((s) => s.hundredths === 10)).toBe(true);
  });

  it('never produces NaN or Infinity', () => {
    const cases = [
      { people: EVEN, kstHundredths: 400, knpp: 0 },
      { people: [], kstHundredths: 0, knpp: 0 },
      { people: [person('a', 0)], kstHundredths: 100, knpp: 1 },
    ];
    for (const c of cases) {
      for (const s of formulaShares(c).shares) {
        expect(Number.isFinite(s.hundredths)).toBe(true);
        expect(Number.isFinite(s.rawHundredths)).toBe(true);
      }
    }
  });
});
