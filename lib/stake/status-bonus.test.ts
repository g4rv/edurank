import { describe, expect, it } from 'vitest';
import { POSITION_ORDER, recommendedStake, statusLines, statusValue } from './status-bonus';

const VALUES = new Map([
  ['VICE_RECTOR', 10] as const,
  ['DEAN', 5] as const,
  ['VICE_DEAN_OR_SECRETARY', 2] as const,
]);

describe('statusValue', () => {
  it('is zero for somebody with no administrative position', () => {
    expect(statusValue(null, VALUES)).toBe(0);
    expect(statusValue(undefined, VALUES)).toBe(0);
  });

  it('reads the value ADMIN set for the position held', () => {
    expect(statusValue('DEAN', VALUES)).toBe(0.05);
    expect(statusValue('VICE_DEAN_OR_SECRETARY', VALUES)).toBe(0.02);
  });

  // A position ADMIN has not priced counts nothing rather than throwing: the
  // seven positions exist whether or not anybody has decided what they are worth.
  it('is zero for a position the year has no value for', () => {
    expect(statusValue('LAB_OR_CENTER_HEAD', VALUES)).toBe(0);
  });
});

describe('statusLines', () => {
  it('returns every position, not only the one held', () => {
    const lines = statusLines('DEAN', VALUES);
    expect(lines).toHaveLength(POSITION_ORDER.length);
    expect(lines.map((l) => l.position)).toEqual([...POSITION_ORDER]);
  });

  it('marks exactly the position held', () => {
    const lines = statusLines('DEAN', VALUES);
    expect(lines.filter((l) => l.counts).map((l) => l.position)).toEqual(['DEAN']);
  });

  it('marks nothing when the person holds no position', () => {
    expect(statusLines(null, VALUES).some((l) => l.counts)).toBe(false);
  });

  // The point of showing unheld positions: «what would this have been worth».
  it('carries the value of positions the person does not hold', () => {
    const rector = statusLines('DEAN', VALUES).find((l) => l.position === 'VICE_RECTOR');
    expect(rector).toMatchObject({ value: 0.1, counts: false });
  });

  it('labels every line in Ukrainian', () => {
    for (const line of statusLines(null, VALUES)) {
      expect(line.label).not.toHaveLength(0);
      expect(line.label).toMatch(/[а-яіїєґА-ЯІЇЄҐ]/);
    }
  });
});

describe('recommendedStake', () => {
  // The worked example from the design conversation: Ліщенко, formula 0,95,
  // one recruited student worth 0,077, заступник декана worth 0,02 — which
  // comes to 1,047 and is shown as 1,05.
  it('adds the students and the status to the formula', () => {
    expect(recommendedStake({ formulaHundredths: 95, studentBonus: 0.077, status: 0.02 })).toBe(
      1.05
    );
  });

  it('is the formula alone when there is nothing to add', () => {
    expect(recommendedStake({ formulaHundredths: 70, studentBonus: 0, status: 0 })).toBe(0.7);
  });

  // Deliberate: a ceiling is a fact about what can be paid, not about what was
  // earned, and hiding the excess is what the head needs to argue with.
  it('is NOT capped at anything — 1,047 stands even against a Макс of 1,00', () => {
    const value = recommendedStake({ formulaHundredths: 95, studentBonus: 0.077, status: 0.02 });
    expect(value).toBeGreaterThan(1);
  });

  // Built on «за формулою», never on what the head typed, so the target does
  // not move while they are working toward it.
  it('ignores whatever the head has currently assigned', () => {
    const before = recommendedStake({ formulaHundredths: 95, studentBonus: 0.077, status: 0.02 });
    // nothing in the signature takes the head's value; this pins that
    expect(before).toBe(1.05);
  });

  // TWO decimals, because the answer goes in a field that takes 0,05 steps —
  // «1,047» was a number nobody could type. Three is the precision a BONUS is
  // recorded at, and that is a different figure in a different column.
  it('rounds to two decimals, the precision a ставка is entered at', () => {
    expect(recommendedStake({ formulaHundredths: 95, studentBonus: 0.077, status: 0.02 })).toBe(
      1.05
    );
    expect(recommendedStake({ formulaHundredths: 70, studentBonus: 0.004, status: 0 })).toBe(0.7);
  });

  // Rounded ONCE at the end. Three заочні контрактні at ~0.0035 are worth 0,01
  // together and nothing at all if each is rounded first.
  it('sums at full precision before rounding', () => {
    expect(recommendedStake({ formulaHundredths: 0, studentBonus: 0.0035 * 3, status: 0 })).toBe(
      0.01
    );
  });
});
