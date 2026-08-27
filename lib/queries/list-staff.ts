import { db } from '@/lib/db';
import { nameSearch } from './name-search';
import { ON_ROSTER, REAL_PEOPLE, onDepartment, onFaculty } from './roster';
import type { AcademicRank, Role, ScientificDegree } from '@/lib/generated/prisma/client';

/** Columns listStaff can order by — the query owns this list; pages validate against it */
export const STAFF_SORT_FIELDS = [
  'lastName',
  'email',
  'academicRank',
  'department',
  'employmentRate',
] as const;

export type StaffSortField = (typeof STAFF_SORT_FIELDS)[number];

export type StaffFilters = {
  isNpp?: boolean;
  // Show only these roles; undefined = all
  roles?: Role[];
  // ADMIN list view: adds role + activation state (never the hash itself)
  includeAccount?: boolean;
  sort?: StaffSortField;
  dir?: 'asc' | 'desc';
  q?: string;
  facultyId?: string;
  departmentId?: string;
  rank?: AcademicRank;
  degree?: ScientificDegree;
  partTime?: boolean;
  degreeMatch?: boolean;
  includeConfidential?: boolean;
  /**
   * Archived people are off the roster and out of this list by default — that
   * is what archiving is for. `'only'` is how an admin finds them again to
   * restore someone; `'all'` exists for nothing yet and is deliberately not
   * wired to a control.
   */
  archived?: 'exclude' | 'only' | 'all';
};

export async function listStaff(filters?: StaffFilters) {
  const sortField = filters?.sort ?? 'lastName';
  const sortDir = filters?.dir ?? 'asc';

  const orderBy =
    sortField === 'lastName'
      ? [{ lastName: sortDir }, { firstName: sortDir }]
      : sortField === 'department'
        ? [{ department: { name: sortDir } }, { division: { name: sortDir } }]
        : sortField === 'employmentRate'
          ? [
              {
                employmentRate: {
                  sort: sortDir,
                  nulls: (sortDir === 'asc' ? 'first' : 'last') as 'first' | 'last',
                },
              },
            ]
          : [{ [sortField]: sortDir }];

  // Never a person, in any of the three archive modes — ON_ROSTER carries this
  // too, but it is only applied in «exclude», and the account must not appear
  // under «Архівовані» or «Усі» either.
  const conditions: object[] = [REAL_PEOPLE];

  const archived = filters?.archived ?? 'exclude';
  if (archived === 'exclude') conditions.push(ON_ROSTER);
  if (archived === 'only') conditions.push({ archivedAt: { not: null } });

  if (filters?.isNpp !== undefined) conditions.push({ isNpp: filters.isNpp });
  if (filters?.roles?.length) conditions.push({ role: { in: filters.roles } });
  // Primary or сумісник, exactly like the кафедра filter below — the two are
  // ANDed, so a primary-only faculty filter cancelled out the кафедра one.
  if (filters?.facultyId) conditions.push(onFaculty(filters.facultyId));
  // Primary or сумісник — filtering by кафедра must find everyone the кафедра
  // actually has, which is everyone its ставка grid will show.
  if (filters?.departmentId) conditions.push(onDepartment(filters.departmentId));
  if (filters?.rank) conditions.push({ academicRank: filters.rank });
  if (filters?.degree) conditions.push({ scientificDegree: filters.degree });
  if (filters?.partTime) conditions.push({ partTimeDepartments: { some: {} } });
  if (filters?.degreeMatch) conditions.push({ degreeMatchesDepartment: true });
  if (filters?.q) {
    // Word by word — see `nameSearch`. «Дудар Василь» used to find nobody.
    const search = nameSearch(filters.q, [
      'lastName',
      'firstName',
      'patronymic',
      'email',
      'orcidId',
    ]);
    if (search) conditions.push(search);
  }

  const rows = await db.staff.findMany({
    where: conditions.length > 0 ? { AND: conditions } : undefined,
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      email: true,
      isNpp: true,
      archivedAt: true,
      academicRank: true,
      scientificDegree: true,
      ...(filters?.includeConfidential ? { employmentRate: true } : {}),
      ...(filters?.includeAccount ? { role: true, passwordHash: true } : {}),
      department: { select: { name: true } },
      division: { select: { name: true } },
      partTimeDepartments: { select: { department: { select: { name: true } } } },
    },
    orderBy,
  });

  // Strip the hash before it can leave the query layer — UI only gets a boolean
  return rows.map(({ passwordHash, ...rest }) => ({
    ...rest,
    isActivated: filters?.includeAccount ? typeof passwordHash === 'string' : undefined,
  }));
}

export type StaffListItem = Awaited<ReturnType<typeof listStaff>>[number];
