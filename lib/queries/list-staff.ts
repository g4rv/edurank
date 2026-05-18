import { db } from '@/lib/db';

const VALID_SORTS = ['lastName', 'email', 'academicRank', 'department'] as const;
type SortField = (typeof VALID_SORTS)[number];

export async function listStaff(filters?: {
  type?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
}) {
  const isNpp = filters?.type === 'npp' ? true : filters?.type === 'admin' ? false : undefined;

  const sortField =
    typeof filters?.sort === 'string' && (VALID_SORTS as readonly string[]).includes(filters.sort)
      ? (filters.sort as SortField)
      : 'lastName';
  const sortDir = filters?.dir === 'desc' ? ('desc' as const) : ('asc' as const);

  const orderBy =
    sortField === 'lastName'
      ? [{ lastName: sortDir }, { firstName: sortDir }]
      : sortField === 'department'
        ? [{ department: { name: sortDir } }, { division: { name: sortDir } }]
        : [{ [sortField]: sortDir }];

  return db.staff.findMany({
    where: isNpp !== undefined ? { isNpp } : undefined,
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      email: true,
      isNpp: true,
      academicRank: true,
      scientificDegree: true,
      department: { select: { name: true } },
      division: { select: { name: true } },
    },
    orderBy,
  });
}

export type StaffListItem = Awaited<ReturnType<typeof listStaff>>[number];
