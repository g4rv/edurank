import { db } from '@/lib/db';
import { nameSearch } from './name-search';
import { ON_ROSTER, REAL_PEOPLE, onDepartment, onFaculty } from './roster';

export type RatingSortField = 'name' | 'department' | 's1' | 's2' | 's3' | 's4' | 's5' | 'total';

export interface RatingListFilters {
  year: number;
  facultyId?: string;
  departmentId?: string;
  q?: string;
  sort?: RatingSortField;
  dir?: 'asc' | 'desc';
}

/**
 * Ranked rollup for one year: every НПП (zero-score ones included),
 * sorted by total descending. ~300 rows — sorting in JS is fine.
 */
export async function listRatings(filters: RatingListFilters) {
  // A closed year is frozen history: its ranking must keep everyone who was in
  // it, including people archived since — otherwise last year's table quietly
  // changes shape every time somebody leaves. An open year is the live roster,
  // so archived people drop out of it, which is the point of archiving them.
  const closed =
    (
      await db.ratingTemplate.findUnique({
        where: { year: filters.year },
        select: { status: true },
      })
    )?.status === 'CLOSED';

  // REAL_PEOPLE rather than relying on `isNpp`: a closed year drops ON_ROSTER
  // on purpose, and «not an НПП» is a different statement from «not a person».
  const conditions: object[] = [{ isNpp: true }, REAL_PEOPLE];
  if (!closed) conditions.push(ON_ROSTER);
  // Primary or сумісник, exactly like the кафедра filter below — the two are
  // ANDed, so a primary-only faculty filter cancelled out the кафедра one.
  if (filters.facultyId) conditions.push(onFaculty(filters.facultyId));
  // Primary or сумісник. This only widens the FILTERED view — the unfiltered
  // university ranking is still one row per person, because a `some` filter
  // selects people rather than multiplying them. Listing somebody twice would
  // break the ranking, which is the whole point of the page.
  if (filters.departmentId) conditions.push(onDepartment(filters.departmentId));
  if (filters.q) {
    // Word by word — see `nameSearch`. «Ігнатенко Микола» used to find nobody.
    const search = nameSearch(filters.q, ['lastName', 'firstName', 'patronymic']);
    if (search) conditions.push(search);
  }

  const staff = await db.staff.findMany({
    where: { AND: conditions },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true, faculty: { select: { name: true } } } },
      partTimeDepartments: { select: { department: { select: { name: true } } } },
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

  const rows = staff.map((s) => {
    const entry = s.ratingEntries[0];
    return {
      id: s.id,
      name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
      department: s.department?.name ?? null,
      faculty: s.department?.faculty?.name ?? null,
      /** Кафедри that also pay them — the «Сумісник» badge keys off this */
      partTimeDepartments: s.partTimeDepartments.map((p) => p.department.name),
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
  });

  // Default view is the ranking: highest total first. Any column can override.
  const sort = filters.sort ?? 'total';
  const sign = (filters.dir ?? 'desc') === 'asc' ? 1 : -1;
  const value = (r: (typeof rows)[number]): string | number => {
    switch (sort) {
      case 'name':
        return r.name;
      case 'department':
        return r.department ?? '';
      case 'total':
        return r.total;
      default:
        return r.sections[Number(sort[1]) - 1];
    }
  };

  return rows.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp =
      typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb, 'uk')
        : (va as number) - (vb as number);
    // Ties always fall back to name, so the order never wobbles between loads.
    if (cmp === 0) return a.name.localeCompare(b.name, 'uk');
    return sign * cmp;
  });
}

export type RatingRow = Awaited<ReturnType<typeof listRatings>>[number];
