import { db } from '@/lib/db';

export interface DepartmentReportRow {
  id: string;
  name: string;
  faculty: string;
  facultyId: string;
  /** null — nobody has saved this кафедра's report this year */
  totalScore: number | null;
  updatedAt: Date | null;
}

/**
 * Every кафедра `ids` allows, with its Рейтинг кафедри total for `year`.
 *
 * Ordered highest total first, then by name; a кафедра with no report goes
 * last — it has not been ranked, it has not scored zero.
 */
export async function listDepartmentReports(
  year: number,
  ids: string[] | 'all'
): Promise<DepartmentReportRow[]> {
  const departments = await db.department.findMany({
    where: ids === 'all' ? {} : { id: { in: ids } },
    select: {
      id: true,
      name: true,
      facultyId: true,
      faculty: { select: { name: true } },
      ratingReports: { where: { year }, select: { totalScore: true, updatedAt: true } },
    },
  });

  return departments
    .map((d) => ({
      id: d.id,
      name: d.name,
      faculty: d.faculty.name,
      facultyId: d.facultyId,
      totalScore: d.ratingReports[0]?.totalScore ?? null,
      updatedAt: d.ratingReports[0]?.updatedAt ?? null,
    }))
    .sort((a, b) => {
      if (a.totalScore === null && b.totalScore !== null) return 1;
      if (b.totalScore === null && a.totalScore !== null) return -1;
      const byTotal = (b.totalScore ?? 0) - (a.totalScore ?? 0);
      return byTotal !== 0 ? byTotal : a.name.localeCompare(b.name, 'uk');
    });
}
