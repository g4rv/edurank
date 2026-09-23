import { describe, expect, it } from 'vitest';
import {
  currentMonthKey,
  dateToMonthKey,
  isMonthKey,
  monthLabel,
  monthOptions,
  monthProblem,
  monthToDate,
} from './execution-month';

const SEPT_15 = new Date('2026-09-15T12:00:00Z');

describe('month keys', () => {
  it('accepts YYYY-MM only', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-9')).toBe(false);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('')).toBe(false);
  });

  it('reads the current month in Kyiv, not UTC', () => {
    // 31 Aug 22:30 UTC is already 1 September 01:30 in Kyiv (EEST, UTC+3).
    expect(currentMonthKey(new Date('2026-08-31T22:30:00Z'))).toBe('2026-09');
  });

  it('round-trips through the stored DATE', () => {
    expect(monthToDate('2026-09').toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(dateToMonthKey(monthToDate('2027-01'))).toBe('2027-01');
  });

  it('names the month in Ukrainian', () => {
    expect(monthLabel('2026-09')).toBe('Вересень 2026');
    expect(monthLabel('2027-01')).toBe('Січень 2027');
  });
});

describe('monthOptions', () => {
  it('lists this month and N before it, newest first, across a year boundary', () => {
    const options = monthOptions(new Date('2027-02-10T12:00:00Z'), 3);
    expect(options).toEqual(['2027-02', '2027-01', '2026-12', '2026-11']);
  });

  it('gives 13 options for the default 12', () => {
    expect(monthOptions(SEPT_15, 12)).toHaveLength(13);
    expect(monthOptions(SEPT_15, 12).at(-1)).toBe('2025-09');
  });
});

describe('monthProblem — D42', () => {
  const check = (month: string) => monthProblem({ month, now: SEPT_15, lookbackMonths: 12 });

  it('accepts this month and exactly 12 back', () => {
    expect(check('2026-09')).toBeNull();
    expect(check('2025-09')).toBeNull();
  });

  it('refuses 13 back', () => {
    expect(check('2025-08')).toBe('Роботу, виконану понад 12 міс. тому, додати не можна');
  });

  it('refuses the future', () => {
    expect(check('2026-10')).toBe('Місяць виконання не може бути в майбутньому');
  });

  it('refuses a missing or malformed month', () => {
    expect(check('')).toBe('Оберіть місяць виконання');
    expect(check('вересень')).toBe('Оберіть місяць виконання');
  });
});
