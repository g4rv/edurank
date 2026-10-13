import { currentAcademicYear, stakeYearOf } from '@/lib/science/academic-year';

/**
 * How far back a qualification document may be dated: the last five навчальних
 * років (owner, 2026-10-13).
 *
 * **Independent of the rating year** — these records feed nothing, so no
 * `RatingTemplate` decides the window. It is the навчальний рік (1 вересня –
 * 31 серпня) that moves it: during 2026/2027 the five years are 2022/2023 …
 * 2026/2027, so nothing issued before 1 вересня 2022 is accepted.
 *
 * Pure, so the form (for its date picker and its «Зберегти» button) and the
 * action (for the refusal that does not trust the form) read one definition.
 */
export const QUALIFICATION_WINDOW_YEARS = 5;

/** `YYYY-MM-DD` — the first day of the oldest навчальний рік still counted. */
export function qualificationMinDate(now: Date = new Date()): string {
  const openedIn = stakeYearOf(currentAcademicYear(now));
  return `${openedIn - (QUALIFICATION_WINDOW_YEARS - 1)}-09-01`;
}
