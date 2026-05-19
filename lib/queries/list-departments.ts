import { db } from '@/lib/db';

export async function listDepartments() {
  return db.department.findMany({
    select: {
      id: true,
      name: true,
      facultyId: true,
      faculty: { select: { name: true } },
    },
    orderBy: [{ faculty: { name: 'asc' } }, { name: 'asc' }],
  });
}

export type DepartmentOption = Awaited<ReturnType<typeof listDepartments>>[number];
