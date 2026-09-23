import { describe, expect, it } from 'vitest';
import {
  currentMonthKey,
  executionWindow,
  dateToMonthKey,
  isMonthKey,
  lastMonthProblem,
  monthLabel,
  monthOptions,
  monthProblem,
  monthRangeLabel,
  monthToDate,
  startedMonthProblem,
} from './execution-month';

const YEAR = '2026/2027';
/** Червень — the owner's end of the year's execution window (2026-09-23). */
const LAST = 6;

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

describe('monthOptions — the навчальний рік so far (D48)', () => {
  it('offers only September in September', () => {
    expect(monthOptions(new Date('2026-09-15T12:00:00Z'), YEAR, LAST)).toEqual(['2026-09']);
  });

  it('runs from September to this month, newest first, across the new year', () => {
    expect(monthOptions(new Date('2027-02-10T12:00:00Z'), YEAR, LAST)).toEqual([
      '2027-02',
      '2027-01',
      '2026-12',
      '2026-11',
      '2026-10',
      '2026-09',
    ]);
  });

  it('stops at the year’s last month, even when «now» is later', () => {
    const options = monthOptions(new Date('2027-10-05T12:00:00Z'), YEAR, LAST);
    expect(options).toHaveLength(10);
    expect(options[0]).toBe('2027-06');
    expect(options.at(-1)).toBe('2026-09');
  });

  it('follows the year’s own last month', () => {
    expect(monthOptions(new Date('2027-10-05T12:00:00Z'), YEAR, 5)[0]).toBe('2027-05');
  });

  it('offers nothing before the year has begun', () => {
    expect(monthOptions(new Date('2026-08-20T12:00:00Z'), YEAR, LAST)).toEqual([]);
  });
});

describe('monthProblem — D48', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const check = (month: string) =>
    monthProblem({ month, now, academicYear: YEAR, lastMonth: LAST });

  it('accepts any month of the year so far', () => {
    expect(check('2026-09')).toBeNull();
    expect(check('2026-11')).toBeNull();
  });

  it('refuses a month before the year', () => {
    expect(check('2026-08')).toBe('Місяць виконання має бути в межах 2026/2027 навчального року');
  });

  it('refuses the future', () => {
    expect(check('2026-12')).toBe('Місяць виконання не може бути в майбутньому');
  });

  it('refuses a month after the year’s last month, even if «now» is later', () => {
    expect(
      monthProblem({
        month: '2027-08',
        now: new Date('2027-10-05T12:00:00Z'),
        academicYear: YEAR,
        lastMonth: LAST,
      })
    ).toBe('Місяць виконання має бути в межах 2026/2027 навчального року');
  });

  it('refuses a missing or malformed month', () => {
    expect(check('')).toBe('Оберіть місяць виконання');
    expect(check('вересень')).toBe('Оберіть місяць виконання');
  });
});

describe('startedMonthProblem — «Робота тривала кілька місяців»', () => {
  const now = new Date('2026-12-15T12:00:00Z');
  const check = (started: string, finished: string) =>
    startedMonthProblem({ started, finished, now, academicYear: YEAR, lastMonth: LAST });

  it('accepts a start before the finish, both in the year', () => {
    expect(check('2026-09', '2026-12')).toBeNull();
  });

  it('refuses a start after the finish', () => {
    expect(check('2026-11', '2026-10')).toBe('Місяць початку має бути раніше за місяць завершення');
  });

  it('refuses a start equal to the finish — that is one month, not several', () => {
    expect(check('2026-10', '2026-10')).toBe('Місяць початку має бути раніше за місяць завершення');
  });

  it('refuses a start before the навчальний рік', () => {
    expect(check('2026-06', '2026-10')).toBe(
      'Місяць виконання має бути в межах 2026/2027 навчального року'
    );
  });
});

describe('lastMonthProblem — the setting ADMIN may save', () => {
  it('accepts January to August — the months of the second calendar year', () => {
    for (let m = 1; m <= 8; m++) expect(lastMonthProblem(m)).toBeNull();
  });

  it('refuses anything else', () => {
    for (const m of [0, 9, 12, 1.5]) {
      expect(lastMonthProblem(m)).toBe('Останній місяць — від січня до серпня');
    }
  });
});

describe('monthRangeLabel', () => {
  it('names the year once when both months share it', () => {
    expect(monthRangeLabel('2026-09', '2026-12')).toBe('Вересень – Грудень 2026');
  });

  it('names both years across the new year', () => {
    expect(monthRangeLabel('2026-11', '2027-02')).toBe('Листопад 2026 – Лютий 2027');
  });
});

describe('executionWindow — what the period picker shows and allows', () => {
  it('shows September → the last month, and allows up to now', () => {
    expect(executionWindow(new Date('2026-11-15T12:00:00Z'), YEAR, LAST)).toEqual({
      first: '2026-09',
      last: '2027-06',
      upTo: '2026-11',
    });
  });

  it('allows up to the last month once the year has run out', () => {
    expect(executionWindow(new Date('2027-10-05T12:00:00Z'), YEAR, LAST).upTo).toBe('2027-06');
  });

  it('allows nothing before the year has begun', () => {
    expect(executionWindow(new Date('2026-08-20T12:00:00Z'), YEAR, LAST).upTo).toBeNull();
  });
});
