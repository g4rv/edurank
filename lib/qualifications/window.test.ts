import { describe, expect, it } from 'vitest';
import { qualificationMinDate } from './window';

describe('qualificationMinDate', () => {
  it('opens on 1 September, four навчальних років before the current one', () => {
    // October 2026 is inside 2026/2027 → 2022/2023 … 2026/2027.
    expect(qualificationMinDate(new Date('2026-10-13T12:00:00Z'))).toBe('2022-09-01');
  });

  it('is still the same window in the spring, when the year began last autumn', () => {
    // March 2027 is inside 2026/2027 as well.
    expect(qualificationMinDate(new Date('2027-03-01T12:00:00Z'))).toBe('2022-09-01');
    expect(qualificationMinDate(new Date('2027-08-31T12:00:00Z'))).toBe('2022-09-01');
  });

  it('moves up a year on 1 September, Kyiv time', () => {
    expect(qualificationMinDate(new Date('2027-09-01T12:00:00Z'))).toBe('2023-09-01');
    // 21:30 UTC on 31 August is already 00:30 on 1 September in Kyiv (EEST).
    expect(qualificationMinDate(new Date('2027-08-31T21:30:00Z'))).toBe('2023-09-01');
    expect(qualificationMinDate(new Date('2027-08-31T20:30:00Z'))).toBe('2022-09-01');
  });
});
