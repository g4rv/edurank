import { db } from '@/lib/db';
import type { AcademicRank, Role, ScientificDegree } from '@/lib/generated/prisma/client';

const _VALID_SORTS = ['lastName', 'email', 'academicRank', 'department', 'employmentRate'] as const;
type SortField = (typeof _VALID_SORTS)[number];

export type StaffFilters = {
  isNpp?: boolean;
  // Show only these roles; undefined = all
  roles?: Role[];
  // ADMIN list view: adds role + activation state (never the hash itself)
  includeAccount?: boolean;
  sort?: SortField;
  dir?: 'asc' | 'desc';
  q?: string;
  facultyId?: string;
  departmentId?: string;
  rank?: AcademicRank;
  degree?: ScientificDegree;
  partTime?: boolean;
  degreeMatch?: boolean;
  includeConfidential?: boolean;
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

  const conditions: object[] = [];

  if (filters?.isNpp !== undefined) conditions.push({ isNpp: filters.isNpp });
  if (filters?.roles?.length) conditions.push({ role: { in: filters.roles } });
  if (filters?.facultyId) conditions.push({ department: { facultyId: filters.facultyId } });
  if (filters?.departmentId) conditions.push({ departmentId: filters.departmentId });
  if (filters?.rank) conditions.push({ academicRank: filters.rank });
  if (filters?.degree) conditions.push({ scientificDegree: filters.degree });
  if (filters?.partTime) conditions.push({ partTimeDepartments: { some: {} } });
  if (filters?.degreeMatch) conditions.push({ degreeMatchesDepartment: true });
  if (filters?.q) {
    const q = filters.q;
    conditions.push({
      OR: [
        { lastName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { patronymic: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { orcidId: { contains: q, mode: 'insensitive' } },
      ],
    });
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
      academicRank: true,
      scientificDegree: true,
      ...(filters?.includeConfidential ? { employmentRate: true } : {}),
      ...(filters?.includeAccount ? { role: true, passwordHash: true } : {}),
      department: { select: { name: true } },
      division: { select: { name: true } },
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
