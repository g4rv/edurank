import { KYIV } from '@/lib/kyiv-time';

/**
 * How far back a qualification document may be dated: the last five CALENDAR
 * years (owner, 2026-10-14, replacing the five навчальних років of 2026-10-13) —
 * in 2026 that is 2022 … 2026, so anything from 1 січня 2022 is accepted.
 *
 * **Independent of the rating year** — these records feed nothing, so no
 * `RatingTemplate` decides the window. It moves on 1 січня, Kyiv time.
 *
 * Pure, so the form (for its date picker and its «Зберегти» button) and the
 * action (for the refusal that does not trust the form) read one definition.
 */
export const QUALIFICATION_WINDOW_YEARS = 5;

/** `YYYY-MM-DD` — the first day of the oldest calendar year still counted. */
export function qualificationMinDate(now: Date = new Date()): string {
  const thisYear = Number(now.toLocaleDateString('en-CA', KYIV).slice(0, 4));
  return `${thisYear - (QUALIFICATION_WINDOW_YEARS - 1)}-01-01`;
}
