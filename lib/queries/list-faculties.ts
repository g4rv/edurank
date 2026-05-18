import { db } from '@/lib/db';

export async function listFaculties(options?: {
  sort?: string | string[];
  dir?: string | string[];
}) {
  const sortDir = options?.dir === 'desc' ? ('desc' as const) : ('asc' as const);

  return db.faculty.findMany({
    select: {
      id: true,
      name: true,
      dean: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
      _count: { select: { departments: true } },
    },
    orderBy: { name: sortDir },
  });
}

export type FacultyListItem = Awaited<ReturnType<typeof listFaculties>>[number];
