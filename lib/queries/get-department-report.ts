import { db } from '@/lib/db';
import type { IndicatorOption, IndicatorRow, ReportValues } from '@/lib/department-rating/score';
import { readNarrative, type DepartmentNarrative } from '@/validations/department-report';

export interface DepartmentReportView {
  department: { id: string; name: string; faculty: string | null };
  indicators: IndicatorRow[];
  report: {
    values: ReportValues;
    narrative: DepartmentNarrative;
    totalScore: number;
    updatedAt: Date;
    updatedByName: string | null;
  } | null;
}

/** The year's lines, in the template's order — what both the form and the save score against. */
export async function listDepartmentIndicators(year: number): Promise<IndicatorRow[]> {
  const rows = await db.departmentIndicator.findMany({
    where: { year },
    orderBy: { order: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    itemNumber: r.itemNumber,
    label: r.label,
    kind: r.kind,
    coefficient: r.coefficient,
    options: Array.isArray(r.options) ? (r.options as unknown as IndicatorOption[]) : [],
    isActive: r.isActive,
  }));
}

/** One кафедра's Рейтинг кафедри for `year`; `report` is null until somebody saves. Access is the caller's. */
export async function getDepartmentReport(
  departmentId: string,
  year: number
): Promise<DepartmentReportView | null> {
  const [department, indicators, report] = await Promise.all([
    db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, faculty: { select: { name: true } } },
    }),
    listDepartmentIndicators(year),
    db.departmentReport.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: {
        values: true,
        narrative: true,
        totalScore: true,
        updatedAt: true,
        updatedBy: { select: { lastName: true, firstName: true } },
      },
    }),
  ]);
  if (!department) return null;

  return {
    department: {
      id: department.id,
      name: department.name,
      faculty: department.faculty?.name ?? null,
    },
    indicators,
    report: report && {
      values: readValues(report.values),
      narrative: readNarrative(report.narrative),
      totalScore: report.totalScore,
      updatedAt: report.updatedAt,
      updatedByName: report.updatedBy
        ? `${report.updatedBy.lastName} ${report.updatedBy.firstName}`
        : null,
    },
  };
}

/**
 * Stored values, keeping only whole numbers ≥ 0 — anything else reads as an
 * empty line. 0 stays: it is a CHOICE's first option. A COUNT of 0 can no
 * longer be saved (1–999), and the form drops one it finds.
 */
export function readValues(stored: unknown): ReportValues {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const out: ReportValues = {};
  for (const [id, v] of Object.entries(stored)) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[id] = v;
  }
  return out;
}
