import type { ReportDepartment } from '@/lib/queries/get-rating-chart';
import type { DepartmentReportRow } from '@/lib/queries/list-department-reports';
import type { TopStaffRow } from '@/lib/dashboard/top-staff';

// What the dashboard's ranking card draws, as plain rows. The card used to be a
// Recharts bar chart whose category axis had to hold 31 long кафедра names in
// about 150px, so they wrapped onto each other. Rows give each name the width it
// needs — and the same shape serves a кафедра's НПП and the кафедра-rating.

export interface RankRow {
  key: string;
  /** null — not ranked (a кафедра with no report yet) */
  rank: number | null;
  name: string;
  /** Small line under the name — the факультет */
  sub?: string;
  value: number;
  /** A paired row's second bar: the total beside the chosen розділ */
  second?: number;
  /** Nothing to rank — drawn quiet, with `note` where the score would be */
  empty?: boolean;
  note?: string;
}

/** A bar's length as a percentage of the longest, kept inside 0–100 */
export function barPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / max) * 100);
}

const shortName = (name: string) => name.replace(/^Кафедра\s+/i, '');

/** `null` is «Загальний бал», otherwise the zero-based розділ */
function pick(sections: number[], total: number, metricIdx: number | null) {
  return metricIdx === null ? total : sections[metricIdx];
}

/** Every кафедра's average of the chosen показник, highest first */
export function departmentRows(
  departments: ReportDepartment[],
  metricIdx: number | null
): RankRow[] {
  return departments
    .map((d) => ({
      key: d.id,
      name: shortName(d.name),
      sub: d.faculty,
      value: pick(d.avgSections, d.avgTotal, metricIdx),
      total: d.avgTotal,
    }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        // Level on the chosen показник: the bigger total stands higher
        b.total - a.total ||
        a.name.localeCompare(b.name, 'uk')
    )
    .map(({ total: _total, ...row }, i) => ({ ...row, rank: i + 1 }));
}

/**
 * One кафедра's НПП. With a розділ chosen the row pairs it with the person's
 * total — the two bars the circulated PDF puts side by side.
 */
export function staffRows(department: ReportDepartment, metricIdx: number | null): RankRow[] {
  return (
    department.staff
      .map((s, i) => ({
        key: `${department.id}:${i}`,
        name: s.name,
        value: pick(s.sections, s.total, metricIdx),
        second: metricIdx === null ? undefined : s.total,
      }))
      // Two people level on a розділ: the one with the greater total stands higher
      .sort(
        (a, b) =>
          b.value - a.value ||
          (b.second ?? b.value) - (a.second ?? a.value) ||
          a.name.localeCompare(b.name, 'uk')
      )
      .map((row, i) => ({ ...row, rank: i + 1 }))
  );
}

/**
 * The кафедра-rating: ranked by the saved report's total. A кафедра nobody has
 * filled in has not scored zero, it has not been ranked — it goes last, quiet.
 */
export function reportRows(reports: DepartmentReportRow[]): RankRow[] {
  const filled = reports
    .filter((r) => r.totalScore !== null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0) || a.name.localeCompare(b.name, 'uk'))
    .map((r, i) => ({
      key: r.id,
      rank: i + 1,
      name: shortName(r.name),
      sub: r.faculty,
      value: r.totalScore ?? 0,
    }));
  const missing = reports
    .filter((r) => r.totalScore === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
    .map((r) => ({
      key: r.id,
      rank: null,
      name: shortName(r.name),
      sub: r.faculty,
      value: 0,
      empty: true,
      note: 'Не заповнено',
    }));
  return [...filled, ...missing];
}

/**
 * The «Топ-20 НПП». `paired` — a розділ is chosen, so the year's total rides
 * beside it as the red bar; for the total itself one bar says it all.
 */
export function topStaffRows(top: TopStaffRow[], paired: boolean): RankRow[] {
  return top
    .map((p) => ({
      key: p.id,
      name: p.name,
      sub:
        [p.department && shortName(p.department), p.faculty].filter(Boolean).join(' · ') ||
        undefined,
      value: p.value,
      second: paired ? p.total : undefined,
    }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        (b.second ?? b.value) - (a.second ?? a.value) ||
        a.name.localeCompare(b.name, 'uk')
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
