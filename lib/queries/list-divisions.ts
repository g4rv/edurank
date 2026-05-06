import { db } from '@/lib/db';

export async function listDivisions() {
  return db.division.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export type DivisionOption = Awaited<ReturnType<typeof listDivisions>>[number];
