import {
  ACADEMIC_YEAR_PATTERN,
  nextAcademicYear,
  previousAcademicYear,
} from '@/lib/science/academic-year';
import { currentMonthKey } from '@/lib/science/execution-month';

/**
 * In which навчальний рік a CO-AUTHOR may count their share of a work (owner,
 * 2026-10-02 — the boss's own proposal, amending D30's «no splitting across
 * years»).
 *
 * The author enters the work, spreads its hours and names the co-authors — and
 * the work, with the author's own share, belongs to the year it was entered.
 * A co-author may instead put THEIR share into the next навчальний рік, when the
 * work sits in the part of the calendar year the two роки share:
 *
 *   an article published in spring 2027 → 2026/2027 or 2027/2028;
 *   one published in autumn 2026        → 2026/2027 only.
 *
 * So the line is January–August of the year the work's рік ends in — the last
 * months of 2026/2027 are the first of calendar 2027, which 2027/2028 also
 * covers. The date judged is the work's publication date where its form has one
 * (the стаття's «Опубліковано/Проіндексовано», a `date` field with the
 * `currentYear` rule), and otherwise the day the work was entered.
 *
 * Returns the next навчальний рік when the choice exists, `null` when it does
 * not. Who may make it (a co-author, never the author) and while the work's own
 * year is still open are the caller's to check.
 */
export function deferralYear(input: {
  /** The work's own навчальний рік, «2026/2027». */
  academicYear: string;
  sharing: 'SHARED' | 'INDIVIDUAL';
  fields: readonly { kind: string; name: string; rule?: string }[];
  evidence: unknown;
  createdAt: Date;
}): string | null {
  // An INDIVIDUAL work has no pool and nobody to share it with.
  if (input.sharing !== 'SHARED') return null;
  const years = ACADEMIC_YEAR_PATTERN.exec(input.academicYear);
  if (!years) return null;
  const endYear = Number(years[2]);

  const month = publicationMonth(input.fields, input.evidence) ?? currentMonthKey(input.createdAt);
  const [year, monthNumber] = month.split('-').map(Number);

  return year === endYear && monthNumber >= 1 && monthNumber <= 8
    ? nextAcademicYear(input.academicYear)
    : null;
}

/**
 * The PREVIOUS навчальний рік, when a CO-AUTHOR may say their share was already
 * counted there (owner, 2026-10-07) — the mirror of `deferralYear`.
 *
 * Science planning began in the app with 2026/2027, but people reported
 * 2025/2026 on paper. An article published January–August 2026 belongs to both
 * роки (those months end 2025/2026 and are still «this calendar year» for the
 * стаття's date rule), so a co-author may have counted it already; entered now,
 * it would count twice. Their share then counts NOWHERE — it stays a
 * reservation marked with the past рік, which never opens, so the author and
 * the other co-authors keep their hours exactly as they were.
 *
 *   an article published in March 2026   → may be «вже зараховано у 2025/2026»;
 *   one published in October 2026        → may not.
 *
 * Returns the previous навчальний рік when the choice exists, `null` when it
 * does not. Who may make it and while which year is open are the caller's.
 */
export function earlierYear(input: Parameters<typeof deferralYear>[0]): string | null {
  if (input.sharing !== 'SHARED') return null;
  const years = ACADEMIC_YEAR_PATTERN.exec(input.academicYear);
  if (!years) return null;
  const startYear = Number(years[1]);

  const month = publicationMonth(input.fields, input.evidence) ?? currentMonthKey(input.createdAt);
  const [year, monthNumber] = month.split('-').map(Number);

  return year === startYear && monthNumber >= 1 && monthNumber <= 8
    ? previousAcademicYear(input.academicYear)
    : null;
}

/** «YYYY-MM» of the work's publication date, when its form has one and it is filled. */
function publicationMonth(
  fields: readonly { kind: string; name: string; rule?: string }[],
  evidence: unknown
): string | null {
  const field = fields.find((f) => f.kind === 'date' && f.rule === 'currentYear');
  if (!field || !evidence || typeof evidence !== 'object') return null;
  const value = (evidence as Record<string, unknown>)[field.name];
  // Stored as «YYYY-MM-DD» — the calendar day as typed, no time zone to convert.
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : null;
}
