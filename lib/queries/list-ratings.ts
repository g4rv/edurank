import { db } from '@/lib/db';

export interface RatingListFilters {
  year: number;
  facultyId?: string;
  departmentId?: string;
  q?: string;
}

/**
 * Ranked rollup for one year: every НПП (zero-score ones included),
 * sorted by total descending. ~300 rows — sorting in JS is fine.
 */
export async function listRatings(filters: RatingListFilters) {
  const conditions: object[] = [{ isNpp: true }];
  if (filters.facultyId) conditions.push({ department: { facultyId: filters.facultyId } });
  if (filters.departmentId) conditions.push({ departmentId: filters.departmentId });
  if (filters.q) {
    const q = filters.q;
    conditions.push({
      OR: [
        { lastName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { patronymic: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  const staff = await db.staff.findMany({
    where: { AND: conditions },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true, faculty: { select: { name: true } } } },
      ratingEntries: {
        where: { year: filters.year },
        select: {
          section1Score: true,
          section2Score: true,
          section3Score: true,
          section4Score: true,
          section5Score: true,
          totalScore: true,
        },
      },
    },
  });

  return staff
    .map((s) => {
      const entry = s.ratingEntries[0];
      return {
        id: s.id,
        name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
        department: s.department?.name ?? null,
        faculty: s.department?.faculty?.name ?? null,
        sections: entry
          ? [
              entry.section1Score,
              entry.section2Score,
              entry.section3Score,
              entry.section4Score,
              entry.section5Score,
            ]
          : [0, 0, 0, 0, 0],
        total: entry?.totalScore ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'uk'));
}

export type RatingRow = Awaited<ReturnType<typeof listRatings>>[number];
