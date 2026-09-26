import { describe, expect, it } from 'vitest';
import {
  currentAcademicYear,
  isAcademicYear,
  nextAcademicYear,
  stakeYearOf,
} from './academic-year';

describe('isAcademicYear', () => {
  it('accepts consecutive years', () => {
    expect(isAcademicYear('2026/2027')).toBe(true);
  });

  it('refuses a gap, a repeat and a reversal', () => {
    expect(isAcademicYear('2026/2028')).toBe(false);
    expect(isAcademicYear('2026/2026')).toBe(false);
    expect(isAcademicYear('2027/2026')).toBe(false);
  });

  it('refuses anything that is not two four-digit years', () => {
    expect(isAcademicYear('2026')).toBe(false);
    expect(isAcademicYear('26/27')).toBe(false);
    expect(isAcademicYear('2026-2027')).toBe(false);
    expect(isAcademicYear(' 2026/2027 ')).toBe(false);
  });
});

describe('stakeYearOf', () => {
  // The ставка comes from the розподіл of the calendar year the навчальний рік
  // OPENS in — September 2026 is spent against the 2026 distribution.
  it('takes the first half', () => {
    expect(stakeYearOf('2026/2027')).toBe(2026);
  });

  it('throws on a malformed year rather than returning NaN', () => {
    expect(() => stakeYearOf('2026')).toThrow('2026');
  });
});

describe('nextAcademicYear', () => {
  it('moves both halves', () => {
    expect(nextAcademicYear('2026/2027')).toBe('2027/2028');
  });
});

describe('currentAcademicYear', () => {
  it('puts September in the year that is starting', () => {
    expect(currentAcademicYear(new Date('2026-09-15T00:00:00Z'))).toBe('2026/2027');
  });

  it('puts May in the year that is ending', () => {
    expect(currentAcademicYear(new Date('2027-05-04T00:00:00Z'))).toBe('2026/2027');
  });

  it('turns over on 1 September, not 1 January', () => {
    expect(currentAcademicYear(new Date('2026-08-31T00:00:00Z'))).toBe('2025/2026');
    expect(currentAcademicYear(new Date('2026-09-01T00:00:00Z'))).toBe('2026/2027');
  });

  it('turns over at Kyiv midnight, not at UTC midnight', () => {
    // 21:00 UTC on 31 August is 00:00 on 1 September in Kyiv (EEST, UTC+3).
    expect(currentAcademicYear(new Date('2026-08-31T21:00:00Z'))).toBe('2026/2027');
    // One minute earlier is still 31 August there.
    expect(currentAcademicYear(new Date('2026-08-31T20:59:00Z'))).toBe('2025/2026');
  });
});
