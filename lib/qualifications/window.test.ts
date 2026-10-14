import { describe, expect, it } from 'vitest';
import { qualificationMinDate } from './window';

describe('qualificationMinDate', () => {
  it('opens on 1 January, four calendar years before the current one', () => {
    // 2026 → 2022 … 2026, so 1 January 2022 is inside, not 1 September.
    expect(qualificationMinDate(new Date('2026-10-13T12:00:00Z'))).toBe('2022-01-01');
  });

  it('is the same all year, whatever the навчальний рік is doing', () => {
    expect(qualificationMinDate(new Date('2026-01-15T12:00:00Z'))).toBe('2022-01-01');
    expect(qualificationMinDate(new Date('2026-08-31T12:00:00Z'))).toBe('2022-01-01');
    expect(qualificationMinDate(new Date('2026-09-01T12:00:00Z'))).toBe('2022-01-01');
  });

  it('moves up a year on 1 January, Kyiv time', () => {
    expect(qualificationMinDate(new Date('2027-01-01T12:00:00Z'))).toBe('2023-01-01');
    // 22:30 UTC on 31 December is already 00:30 on 1 January in Kyiv (EET).
    expect(qualificationMinDate(new Date('2026-12-31T22:30:00Z'))).toBe('2023-01-01');
    expect(qualificationMinDate(new Date('2026-12-31T21:30:00Z'))).toBe('2022-01-01');
  });
});
