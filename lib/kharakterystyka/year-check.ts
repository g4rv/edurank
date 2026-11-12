/**
 * The year check behind `/admin/kharakterystyka-check` (owner, 2026-11-12).
 *
 * A Характеристика counts only what falls inside the five-year window, but a
 * saved line's `year` is the year it was FILED under — and the filing year is
 * not the publication year. Imported lines were filed one year after the year in
 * their text, and a typed line takes whatever the date picker was set to.
 * Production had ~100 п.1 lines whose bibliographic description names a
 * publication from 2021 or earlier, filed inside the window, while the ЄДЕБО
 * extraction copies the whole document.
 *
 * **This reads the bibliographic description and nothing else.** It is a guess,
 * not a verdict — a year in a title is not a publication year — so it never
 * hides anything itself; the admin ticks the rows.
 */

/** The positions whose lines are a bibliographic description of a publication */
export const CHECKED_POSITIONS = [1, 3, 12] as const;

/** `KharakterystykaEntry.removedReason` of a line this check hid — and the only kind it may bring back */
export const YEAR_OUT_OF_WINDOW = 'YEAR_OUT_OF_WINDOW';

/** The other reason a line is hidden here: the same work is in the person's rating (owner, 2026-11-12) */
export const DUPLICATE_OF_RATING = 'DUPLICATE_OF_RATING';

/** Every reason this page hides a line for — and so every line it may bring back */
export const HIDE_REASONS = [YEAR_OUT_OF_WINDOW, DUPLICATE_OF_RATING] as const;
export type HideReason = (typeof HIDE_REASONS)[number];

/**
 * What is NOT a publication year, taken out before any year is looked for: a
 * range of numbers. Page numbers («с. 2021-2032», also at the end of a DOI) and
 * topic periods in a title («(1991–2004)», «1920-1930-ті») look the same and are
 * never the year the work came out.
 *
 * A link or a DOI is NOT stripped: a bare DOI such as
 * «10.31470/2306-546X-2021-50-83-96» is often the only trace of the year, and
 * about ten production lines were exactly that (owner, 2026-11-12).
 */
const NUMBER_RANGE = /\d{3,4}\s*[-–—]\s*\d{3,4}/g;
const YEAR = /(?<![0-9])((?:19|20)\d{2})(?![0-9])/g;

/** Every distinct year mentioned in the description, once noise is removed, ascending */
export function yearsInDescription(text: string): number[] {
  const clean = text.replace(NUMBER_RANGE, ' ');
  const years = new Set<number>();
  for (const match of clean.matchAll(YEAR)) years.add(Number(match[1]));
  return [...years].sort((a, b) => a - b);
}

export interface YearProblem {
  /** The newest year in the description — what the publication most likely came out in */
  latest: number;
  /** Every year found, so the admin sees what the guess rests on */
  years: number[];
}

/**
 * The description names a publication from BEFORE the window.
 *
 * Judged by the NEWEST year it mentions: a work whose newest year is old cannot
 * have been published inside the window, while an old year beside a recent one
 * is usually a title or a reference. Only «too old» is flagged — a year after
 * the window is nearly always a page number or a typo («… Випуск 83 2028»), and
 * the admin had no wish to hide those. A description with no year says nothing.
 */
export function yearProblem(text: string, window: { from: number }): YearProblem | null {
  const years = yearsInDescription(text);
  if (years.length === 0) return null;
  const latest = years[years.length - 1];
  return latest < window.from ? { latest, years } : null;
}
