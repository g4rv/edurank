import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, formulaShares, type FormulaPerson } from './formula';
import { fromHundredths, minimumKstHundredths, toHundredths } from './units';

function person(rating: number, max = 1, min = 0.1): FormulaPerson {
  return {
    staffId: `s${rating}`,
    rating,
    minHundredths: toHundredths(min),
    maxHundredths: toHundredths(max),
  };
}

const stakes = (r: ReturnType<typeof formulaShares>) =>
  r.shares.map((s) => fromHundredths(s.hundredths));

/**
 * The university's own «Облік ставок кафедри» sheet, for Кафедра історії і
 * культури України: seven people, Кст 6.00, every cap at 1.00. Its screen shows
 * these seven ставки and «не розподілена кількість» of 0.10.
 *
 * This is the reason the formula was rewritten, so it is the test that matters
 * most: if it fails, we are no longer computing what the university computes.
 */
describe('the university’s own кафедра', () => {
  const people = [
    person(5629.57),
    person(3517.32),
    person(5245.09),
    person(4103.3),
    person(2481),
    person(3419),
    person(1325.75),
  ];

  it('reproduces all seven ставки', () => {
    const result = formulaShares({ people, kstHundredths: toHundredths(6) });
    expect(stakes(result)).toEqual([1.0, 0.85, 1.0, 0.9, 0.7, 0.85, 0.6]);
  });

  it('leaves exactly the 0.10 their screen shows as «не розподілено»', () => {
    const result = formulaShares({ people, kstHundredths: toHundredths(6) });
    expect(toHundredths(6) - result.totalHundredths).toBe(10);
  });
});

/**
 * The property the положення's formula did not have: the proposal is a set of
 * SHARES of the pool, so it lands on `Кст` instead of drifting away from it.
 *
 * «Lands on» is not «never exceeds». Every person is snapped to the 0.05
 * ladder, and a кафедра where several round up finishes a few hundredths over
 * — the university's own sheet does this too, which is what its «Перевищення
 * розподілу!» warning exists for. What cannot happen any more is being over by
 * a fifth of the pool.
 */
describe('the proposal lands on the pool', () => {
  it('stays within ladder dust of Кст, across a range of кафедри', () => {
    for (let n = 2; n <= 30; n++) {
      const people = Array.from({ length: n }, (_, i) => person(500 + i * 317));
      for (const kst of [1, 4, 6, 12, 25]) {
        // Only pools the app would accept: below 0.1 × headcount the кафедра
        // cannot pay everyone their floor, and `minimumKstHundredths` refuses
        // the input. See the test below for what happens if it did not.
        if (toHundredths(kst) < minimumKstHundredths(n)) continue;
        const result = formulaShares({ people, kstHundredths: toHundredths(kst) });
        // At worst every person rounds up half a rung
        const dust = Math.ceil(n * 2.5);
        expect(result.totalHundredths, `n=${n} Кст=${kst}`).toBeLessThanOrEqual(
          toHundredths(kst) + dust
        );
      }
    }
  });

  // Why `Кст ≥ 0.1 × headcount` is validated on input rather than trusted: the
  // floor is a promise to each person, so a pool too small to keep it is
  // overspent before the head touches anything.
  it('overshoots a pool too small to pay everyone their floor', () => {
    const people = Array.from({ length: 13 }, (_, i) => person(500 + i * 317));
    const kst = toHundredths(1);
    expect(kst).toBeLessThan(minimumKstHundredths(13));

    const result = formulaShares({ people, kstHundredths: kst });
    expect(result.totalHundredths).toBeGreaterThan(kst);
  });

  // Кафедра вищої математики, the case that exposed the положення's formula:
  // 18 people and Кст 4.00 produced 4.90, opening the grid 0.90 over budget.
  it('is 0.05 over where the положення’s formula was 0.90 over', () => {
    const people = Array.from({ length: 18 }, (_, i) => person(1000 + i * 400));
    const result = formulaShares({ people, kstHundredths: toHundredths(4) });
    expect(result.totalHundredths - toHundredths(4)).toBe(5);
  });
});

describe('order', () => {
  it('never gives a lower-rated person more, when the caps are equal', () => {
    const people = [person(9000), person(6000), person(3000), person(1200), person(400)];
    const result = formulaShares({ people, kstHundredths: toHundredths(5) });
    const values = result.shares.map((s) => s.hundredths);
    for (let i = 1; i < values.length; i++) expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
  });

  // …but a cap is allowed to invert it, because that is what a cap is for
  it('lets a cap hold a higher-rated person below a lower-rated one', () => {
    const people = [person(9000, 0.5), person(3000, 1.5)];
    const result = formulaShares({ people, kstHundredths: toHundredths(3) });
    expect(result.shares[0].hundredths).toBeLessThan(result.shares[1].hundredths);
    expect(result.shares[0].clampedTo).toBe('max');
  });
});

describe('bounds', () => {
  it('caps a person at their maximum', () => {
    const people = [person(9000, 0.75), person(1000)];
    const result = formulaShares({ people, kstHundredths: toHundredths(3) });
    expect(fromHundredths(result.shares[0].hundredths)).toBe(0.75);
    expect(result.shares[0].clampedTo).toBe('max');
  });

  // A big кафедра on the smallest pool it is allowed (0.1 × headcount) is where
  // shares actually fall under the floor; on an ordinary кафедра the sheet's
  // own 0.5 weight floor already keeps everybody well clear of it.
  it('lifts a share that falls under the floor', () => {
    const people = [person(90000), ...Array.from({ length: 19 }, (_, i) => person(i + 1))];
    const result = formulaShares({ people, kstHundredths: toHundredths(2) });
    const floored = result.shares.filter((s) => s.clampedTo === 'min');
    expect(floored.length).toBeGreaterThan(0);
    for (const s of floored) expect(s.hundredths).toBe(toHundredths(0.1));
  });

  it('never pays a rated person less than the floor', () => {
    const people = Array.from({ length: 12 }, (_, i) => person(200 + i * 900));
    const result = formulaShares({ people, kstHundredths: toHundredths(6) });
    for (const s of result.shares) expect(s.hundredths).toBeGreaterThanOrEqual(toHundredths(0.1));
  });

  // A кафедра that has decided somebody holds no ставка this year
  it('pays nothing to a person capped at zero', () => {
    const people = [person(5000), person(4000, 0)];
    const result = formulaShares({ people, kstHundredths: toHundredths(2) });
    expect(result.shares[1].hundredths).toBe(0);
  });

  it('every value sits on the 0.05 ladder', () => {
    const people = Array.from({ length: 11 }, (_, i) => person(137 * (i + 1) + i * i));
    const result = formulaShares({ people, kstHundredths: toHundredths(7) });
    for (const s of result.shares) expect(s.hundredths % 5).toBe(0);
  });
});

describe('cases where nothing can be computed', () => {
  it('says so when every rating is zero', () => {
    const result = formulaShares({ people: [person(0), person(0)], kstHundredths: 400 });
    expect(result.computable).toBe(false);
    expect(result.totalHundredths).toBe(0);
  });

  it('says so for an empty кафедра', () => {
    const result = formulaShares({ people: [], kstHundredths: 400 });
    expect(result.computable).toBe(false);
    expect(result.shares).toEqual([]);
  });

  // A pool that has not been set yet is not the same as a кафедра with no
  // people: the formula is computable, it simply has nothing to hand out.
  it('proposes nothing when Кст is zero', () => {
    const result = formulaShares({ people: [person(5000), person(3000)], kstHundredths: 0 });
    expect(result.computable).toBe(true);
    expect(result.totalHundredths).toBe(0);
  });

  it('leaves a single person with no rating out of the sums', () => {
    const result = formulaShares({
      people: [person(5000), person(0)],
      kstHundredths: toHundredths(1),
    });
    expect(result.shares[1].hundredths).toBe(0);
    expect(result.shares[0].hundredths).toBeGreaterThan(0);
  });
});

describe('DEFAULT_LIMITS', () => {
  // The sheet's own default. 1.5 is the ceiling on a hand-typed value, which is
  // an input rule and not a default.
  it('gives a person one full ставка as their cap', () => {
    expect(fromHundredths(DEFAULT_LIMITS.maxHundredths)).toBe(1);
  });
});
