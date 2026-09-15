/**
 * A навчальний рік is «2026/2027» — a STRING, not an Int.
 *
 * It is not a year, it is a pair of them, and every document the university
 * prints writes it this way. The rating's calendar `year: Int` is a different
 * thing and the two must never be mixed: наказ №152 plans 2026/2027, while
 * `RatingTemplate` 2026 scores January to December.
 */
export const ACADEMIC_YEAR_PATTERN = /^(\d{4})\/(\d{4})$/;

function halves(academicYear: string): [number, number] | null {
  const match = ACADEMIC_YEAR_PATTERN.exec(academicYear);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  // Consecutive, in order. «2026/2028» is not a навчальний рік, and neither is
  // «2027/2026» — both are typos worth refusing at the door rather than
  // discovering when a target is computed against the wrong розподіл.
  return to === from + 1 ? [from, to] : null;
}

export function isAcademicYear(value: string): boolean {
  return halves(value) !== null;
}

/**
 * Which calendar year's `StakeAllocation` supplies the ставка — the year the
 * навчальний рік OPENS in. September 2026 is worked against the 2026 розподіл.
 *
 * Throws rather than returning NaN: a silent NaN here would make every target
 * on the кафедра read «—» with nothing to point at.
 */
export function stakeYearOf(academicYear: string): number {
  const parsed = halves(academicYear);
  if (!parsed) throw new Error(`Не навчальний рік: "${academicYear}"`);
  return parsed[0];
}

export function nextAcademicYear(academicYear: string): string {
  const parsed = halves(academicYear);
  if (!parsed) throw new Error(`Не навчальний рік: "${academicYear}"`);
  return `${parsed[0] + 1}/${parsed[1] + 1}`;
}

/**
 * September–December belong to the year that is starting; January–August to the one ending.
 *
 * Read the date in Europe/Kyiv, not UTC. The university is in Переяслав, Ukraine;
 * at UTC midnight on 1 September (EEST), it is already 03:00 in Kyiv, so answering
 * «is it 2025/2026 or 2026/2027» in UTC is wrong for the three hours before Kyiv
 * midnight. `Intl.DateTimeFormat` handles EET/EEST (and any future DST change) by
 * itself, and it is built in — no dependency needed.
 */
export function currentAcademicYear(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  // Months from Intl are 1-based; 9 = September
  const startsThisYear = month >= 9;
  const from = startsThisYear ? year : year - 1;
  return `${from}/${from + 1}`;
}
