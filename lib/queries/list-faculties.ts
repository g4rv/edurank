import { db } from '@/lib/db';

export async function listFaculties() {
  return db.faculty.findMany({
    select: {
      id: true,
      name: true,
      dean: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
      _count: { select: { departments: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export type FacultyListItem = Awaited<ReturnType<typeof listFaculties>>[number];
