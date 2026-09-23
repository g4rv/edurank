/**
 * D41/D42 (owner, 2026-09-23) — the month a work was done, and how old it may be.
 *
 * Held in code as a `"YYYY-MM"` key and stored as a Postgres DATE on the 1st
 * (`ScienceWork.executedMonth`). The key is what a <select> can carry and what
 * sorts correctly as a string; the DATE is what a chart can group by.
 *
 * «This month» is read in Europe/Kyiv, for the reason `currentAcademicYear`
 * gives: at 00:30 on 1 September in Kyiv it is still August in UTC.
 *
 * The fence moves with the date of ENTRY, not the навчальний рік — an article
 * published in May and indexed in September still gets in; one from 2019 does
 * not. See D42 in the science-plan spec.
 */

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
] as const;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** Months since year 0 — makes «N months back» plain subtraction. */
function toIndex(key: string): number {
  const [, year, month] = MONTH_KEY.exec(key)!;
  return Number(year) * 12 + (Number(month) - 1);
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

/** This month and `lookbackMonths` before it, newest first — the D42 window. */
export function monthOptions(now: Date, lookbackMonths: number): string[] {
  const current = toIndex(currentMonthKey(now));
  return Array.from({ length: lookbackMonths + 1 }, (_, i) => fromIndex(current - i));
}

export function monthProblem(input: {
  month: string;
  now: Date;
  lookbackMonths: number;
}): string | null {
  if (!isMonthKey(input.month)) return 'Оберіть місяць виконання';
  const back = toIndex(currentMonthKey(input.now)) - toIndex(input.month);
  if (back < 0) return 'Місяць виконання не може бути в майбутньому';
  if (back > input.lookbackMonths) {
    return `Роботу, виконану понад ${input.lookbackMonths} міс. тому, додати не можна`;
  }
  return null;
}

export function monthToDate(key: string): Date {
  const index = toIndex(key);
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

/** A `@db.Date` comes back as UTC midnight — read UTC parts, never local ones. */
export function dateToMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const index = toIndex(key);
  return `${MONTH_NAMES[index % 12]} ${Math.floor(index / 12)}`;
}

/** The setting ADMIN may save. 60 is a sanity ceiling, not policy: five years
 *  back is already no fence. */
export function lookbackProblem(months: number): string | null {
  return Number.isInteger(months) && months >= 0 && months <= 60
    ? null
    : 'Кількість місяців — ціле число від 0 до 60';
}
