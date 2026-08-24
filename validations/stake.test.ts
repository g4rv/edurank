import { describe, expect, it } from 'vitest';
import { staffStakeLimitsSchema } from './stake';

const parse = (min: string, max: string) =>
  staffStakeLimitsSchema.safeParse({
    staffId: 's1',
    // Bounds are per-кафедра, so every payload names one.
    departmentId: 'd1',
    year: 2026,
    minHundredths: min,
    maxHundredths: max,
  });

describe('staffStakeLimitsSchema — the 0,05 ladder', () => {
  // A Макс of 0,93 is a ceiling no legal ставка can reach: every value must be a
  // multiple of 0,05, and formulaShares caps the share at exactly 0,93 — which
  // saveDistribution then refuses as off the ladder. The row became unsaveable,
  // and only ADMIN could edit the cap, so the head could not clear it either.
  it('rounds a Максимум DOWN so it stays a ceiling', () => {
    const r = parse('0,10', '0,93');
    expect(r.success).toBe(true);
    expect(r.success && r.data.maxHundredths).toBe(90);
  });

  it('rounds a Мінімум UP so it stays a floor', () => {
    const r = parse('0,12', '1,00');
    expect(r.success).toBe(true);
    expect(r.success && r.data.minHundredths).toBe(15);
  });

  it('leaves a pair already on the ladder alone', () => {
    const r = parse('0,10', '1,00');
    expect(r.success && r.data.minHundredths).toBe(10);
    expect(r.success && r.data.maxHundredths).toBe(100);
  });

  it('accepts a comma or a dot', () => {
    expect(parse('0.15', '1.50').success).toBe(true);
  });
});

describe('staffStakeLimitsSchema — the bounds themselves', () => {
  it('refuses a Мінімум under 0,10 — everybody gets a ставка', () => {
    expect(parse('0,05', '1,00').success).toBe(false);
  });

  it('refuses a Максимум under the Мінімум', () => {
    expect(parse('0,50', '0,25').success).toBe(false);
  });

  // 0,12 rounds up to 0,15 and down to 0,10, so the band inverts. Refusing is
  // the honest answer: a 0,12–0,12 band does not exist on the ladder.
  it('refuses a band too narrow to survive snapping', () => {
    expect(parse('0,12', '0,12').success).toBe(false);
  });

  it('refuses something that is not a number', () => {
    expect(parse('багато', '1,00').success).toBe(false);
  });
});
