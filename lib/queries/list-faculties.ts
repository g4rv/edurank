import { db } from '@/lib/db';

export async function listFaculties(options?: { dir?: string | string[] }) {
  const dir = Array.isArray(options?.dir) ? options.dir[0] : options?.dir;
  const sortDir = dir === 'desc' ? ('desc' as const) : ('asc' as const);

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
