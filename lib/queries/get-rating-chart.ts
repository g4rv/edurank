import { db } from '@/lib/db';

// The two datasets behind the PDF charts. Both read RatingEntry, which already
// holds the per-section scores, so neither needs to touch Activity.

/** Which number a chart plots — a розділ, or the year's total */
export type RatingMetric = 'total' | 1 | 2 | 3 | 4 | 5;

export const METRIC_TITLES: Record<string, string> = {
  total: 'загальною сумою балів',
  1: 'показником професійного розвитку',
  2: 'показником навчальної діяльності',
  3: 'показником науково-інноваційної діяльності',
  4: 'показником організаційної діяльності',
  5: 'показником навчально-методичного забезпечення',
};

export const METRIC_LEGEND: Record<string, string> = {
  total: 'Загальна сума балів за рейтинговим оцінюванням',
  1: 'Показники професійного розвитку',
  2: 'Показники навчальної діяльності',
  3: 'Показники науково-інноваційної діяльності',
  4: 'Показники організаційної діяльності',
  5: 'Показники навчально-методичного забезпечення',
};

interface EntryScores {
  section1Score: number;
  section2Score: number;
  section3Score: number;
  section4Score: number;
  section5Score: number;
  totalScore: number;
}

function valueOf(entry: EntryScores | undefined, metric: RatingMetric): number {
  if (!entry) return 0;
  if (metric === 'total') return entry.totalScore;
  return [
    entry.section1Score,
    entry.section2Score,
    entry.section3Score,
    entry.section4Score,
    entry.section5Score,
  ][metric - 1];
}

const ENTRY_SELECT = {
  section1Score: true,
  section2Score: true,
  section3Score: true,
  section4Score: true,
  section5Score: true,
  totalScore: true,
} as const;

export interface DepartmentBar {
  name: string;
  /** Average per НПП, which is what the reference chart plots */
  value: number;
  nppCount: number;
}

/**
 * «Рейтинг кафедр» — one bar per department, the average score of its НПП.
 * The average, not the sum: otherwise the biggest department always wins.
 * Departments with nobody in them are left out — an empty bar says nothing.
 */
export async function getDepartmentChart(
  year: number,
  metric: RatingMetric
): Promise<DepartmentBar[]> {
  const departments = await db.department.findMany({
    select: {
      name: true,
      primaryStaff: {
        where: { isNpp: true },
        select: { ratingEntries: { where: { year }, select: ENTRY_SELECT } },
      },
    },
  });

  return departments
    .filter((d) => d.primaryStaff.length > 0)
    .map((d) => {
      const sum = d.primaryStaff.reduce((acc, s) => acc + valueOf(s.ratingEntries[0], metric), 0);
      return {
        name: d.name,
        value: sum / d.primaryStaff.length,
        nppCount: d.primaryStaff.length,
      };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'uk'));
}

export interface StaffBar {
  name: string;
  /** Always the year's total — the reference chart shows it beside the metric */
  total: number;
  /** The chosen розділ; equals total when the metric is «загальний бал» */
  value: number;
}

export interface DepartmentStaffChart {
  departmentName: string;
  staff: StaffBar[];
}

/**
 * «Кафедра X» — one row per НПП with two bars: the year's total and the chosen
 * розділ, exactly as the reference PDF pairs them. Sorted by whatever is plotted
 * (the chosen розділ, or the total), so the export matches the on-screen preview.
 */
export async function getDepartmentStaffChart(
  departmentId: string,
  year: number,
  metric: RatingMetric
): Promise<DepartmentStaffChart | null> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: {
      name: true,
      primaryStaff: {
        where: { isNpp: true },
        select: {
          lastName: true,
          firstName: true,
          patronymic: true,
          ratingEntries: { where: { year }, select: ENTRY_SELECT },
        },
      },
    },
  });
  if (!department) return null;

  return {
    departmentName: department.name,
    staff: department.primaryStaff
      .map((s) => {
        const entry = s.ratingEntries[0];
        return {
          name: `${s.lastName} ${s.firstName} ${s.patronymic}`.trim(),
          total: entry?.totalScore ?? 0,
          value: valueOf(entry, metric),
        };
      })
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'uk')),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ReportStaff {
  name: string;
  /** section1..5 scores */
  sections: number[];
  total: number;
}

export interface ReportDepartment {
  id: string;
  name: string;
  nppCount: number;
  /** average of each розділ across the department's НПП */
  avgSections: number[];
  avgTotal: number;
  staff: ReportStaff[];
}

/**
 * Everything the on-screen report chart needs, in one read: each department's
 * per-section averages and every НПП's section scores. The client derives any
 * metric — a розділ or the total — from these without another round trip. A few
 * hundred rows at this scale, so preloading beats a fetch per filter change.
 *
 * The PDF route keeps using getDepartmentChart / getDepartmentStaffChart per
 * metric; this feeds the live preview, which the PDF no longer has to be.
 */
export async function getReportData(year: number): Promise<ReportDepartment[]> {
  const departments = await db.department.findMany({
    select: {
      id: true,
      name: true,
      primaryStaff: {
        where: { isNpp: true },
        select: {
          lastName: true,
          firstName: true,
          patronymic: true,
          ratingEntries: { where: { year }, select: ENTRY_SELECT },
        },
      },
    },
  });

  return departments
    .filter((d) => d.primaryStaff.length > 0)
    .map((d) => {
      const staff: ReportStaff[] = d.primaryStaff
        .map((s) => {
          const e = s.ratingEntries[0];
          return {
            name: `${s.lastName} ${s.firstName} ${s.patronymic}`.trim(),
            sections: [
              e?.section1Score ?? 0,
              e?.section2Score ?? 0,
              e?.section3Score ?? 0,
              e?.section4Score ?? 0,
              e?.section5Score ?? 0,
            ],
            total: e?.totalScore ?? 0,
          };
        })
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'uk'));

      const n = staff.length;
      const avgSections = [0, 1, 2, 3, 4].map((i) =>
        round2(staff.reduce((acc, s) => acc + s.sections[i], 0) / n)
      );
      return {
        id: d.id,
        name: d.name,
        nppCount: n,
        avgSections,
        avgTotal: round2(staff.reduce((acc, s) => acc + s.total, 0) / n),
        staff,
      };
    })
    .sort((a, b) => b.avgTotal - a.avgTotal || a.name.localeCompare(b.name, 'uk'));
}
