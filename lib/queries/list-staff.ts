import { db } from '@/lib/db';

export async function listStaff(filters?: { type?: string | string[] }) {
  const isNpp = filters?.type === 'npp' ? true : filters?.type === 'admin' ? false : undefined;

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
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export type StaffListItem = Awaited<ReturnType<typeof listStaff>>[number];
