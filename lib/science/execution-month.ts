import { stakeYearOf } from '@/lib/science/academic-year';

/**
 * D41/D48 (owner, 2026-09-23) — the month a work was done.
 *
 * **Its purpose is tracking execution** — «Виконано» grouped by month, and the
 * per-month chart — for EVERY вид роботи. It is not an article's publication
 * date: that is a separate, informational field on the стаття (a catalogue
 * `date` field), checked by ННВ by eye and never refused automatically.
 *
 * **The range is the навчальний рік so far**: September of its first year up
 * to the current month, and never past the year's last month
 * (`SciencePlanTemplate.lastExecutionMonth`, Червень by default). Work done
 * before September belongs to the previous year's plan.
 *
 * **A work that took several months keeps its hours in ONE month** — the one
 * it was finished in (owner, 2026-09-23). The start is recorded as a fact
 * («тривала вересень – грудень»), never used to split hours: 100 год over three
 * months would be 33,33… a month, and a pool of hundredths must not be divided
 * into floats.
 *
 * Held in code as a `"YYYY-MM"` key and stored as a Postgres DATE on the 1st
 * (`ScienceWork.executedMonth`). The key is what a <select> can carry and what
 * sorts correctly as a string; the DATE is what a chart can group by.
 *
 * «This month» is read in Europe/Kyiv, for the reason `currentAcademicYear`
 * gives: at 00:30 on 1 September in Kyiv it is still August in UTC.
 */

/**
 * **HIDDEN since 2026-09-24** (owner): the university asked for a record to
 * PROVE the work with evidence, not to track when it was done. Nobody picks a
 * month; `saveRecord` stamps the month the record is saved, so the NOT NULL
 * column stays filled and every stored row stays valid.
 *
 * Hidden, not removed — they may ask for it back. Flipping this to `true`
 * restores the «Період виконання» picker, the month headings in «Виконано»,
 * the month on /moderation and the ⚙ «Останній місяць» setting.
 */
export const SHOW_EXECUTION_PERIOD = false;

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

/** Months since year 0 — makes ranges plain integer comparisons. */
function toIndex(key: string): number {
  const [, year, month] = MONTH_KEY.exec(key)!;
  return Number(year) * 12 + (Number(month) - 1);
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** September of the first year .. `lastMonth` (1–8) of the second, as month
 *  indexes. */
function yearBounds(academicYear: string, lastMonth: number): { first: number; last: number } {
  const from = stakeYearOf(academicYear);
  return { first: from * 12 + 8, last: (from + 1) * 12 + (lastMonth - 1) };
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

/**
 * The year's window as month keys, for the period picker: `first` and `last`
 * are what it SHOWS (September → the year's last month), `upTo` the last month
 * it lets you CLICK — this month, capped at `last`; null before September.
 */
export function executionWindow(
  now: Date,
  academicYear: string,
  lastMonth: number
): { first: string; last: string; upTo: string | null } {
  const { first, last } = yearBounds(academicYear, lastMonth);
  const upTo = Math.min(toIndex(currentMonthKey(now)), last);
  return {
    first: fromIndex(first),
    last: fromIndex(last),
    upTo: upTo < first ? null : fromIndex(upTo),
  };
}

/** The навчальний рік's months so far, newest first. Empty before September. */
export function monthOptions(now: Date, academicYear: string, lastMonth: number): string[] {
  const { first, last } = yearBounds(academicYear, lastMonth);
  const upTo = Math.min(toIndex(currentMonthKey(now)), last);
  const options: string[] = [];
  for (let i = upTo; i >= first; i--) options.push(fromIndex(i));
  return options;
}

export function monthProblem(input: {
  month: string;
  now: Date;
  academicYear: string;
  lastMonth: number;
}): string | null {
  if (!isMonthKey(input.month)) return 'Оберіть місяць виконання';
  const month = toIndex(input.month);
  const { first, last } = yearBounds(input.academicYear, input.lastMonth);
  if (month < first || month > last) {
    return `Місяць виконання має бути в межах ${input.academicYear} навчального року`;
  }
  if (month > toIndex(currentMonthKey(input.now))) {
    return 'Місяць виконання не може бути в майбутньому';
  }
  return null;
}

/**
 * «Робота тривала кілька місяців» — the start must itself be a month of the
 * year, and strictly before the finish: a start equal to the finish is one
 * month, which is what leaving the box unticked already says.
 */
export function startedMonthProblem(input: {
  started: string;
  finished: string;
  now: Date;
  academicYear: string;
  lastMonth: number;
}): string | null {
  const own = monthProblem({
    month: input.started,
    now: input.now,
    academicYear: input.academicYear,
    lastMonth: input.lastMonth,
  });
  if (own) return own;
  if (!isMonthKey(input.finished) || toIndex(input.started) >= toIndex(input.finished)) {
    return 'Місяць початку має бути раніше за місяць завершення';
  }
  return null;
}

/** The setting ADMIN may save: a month of the year's SECOND calendar year,
 *  before the next навчальний рік opens in September. */
export function lastMonthProblem(month: number): string | null {
  return Number.isInteger(month) && month >= 1 && month <= 8
    ? null
    : 'Останній місяць — від січня до серпня';
}

/** «Вересень – Грудень 2026», or «Листопад 2026 – Лютий 2027» across a year. */
export function monthRangeLabel(started: string, finished: string): string {
  const [from, to] = [toIndex(started), toIndex(finished)];
  const sameYear = Math.floor(from / 12) === Math.floor(to / 12);
  return sameYear
    ? `${MONTH_NAMES[from % 12]} – ${monthLabel(finished)}`
    : `${monthLabel(started)} – ${monthLabel(finished)}`;
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
