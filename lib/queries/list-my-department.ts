import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';
import { scopeOf } from './scope';

/**
 * The кафедри a завідувач heads (or a декан covers), with their НПП and each
 * person's total for the given year.
 *
 * This is the head's own view of their people. It exists because headship is
 * not a `Role`: a head is usually an ordinary `USER`, so `/staff` is closed to
 * them, and without this page the Характеристика they are allowed to read would
 * be reachable only by typing a URL.
 *
 * Archived people are excluded — the current roster is what a head distributes
 * ставки across, and someone on декретна відпустка is not part of it.
 */
export async function listMyDepartments(staffId: string | null | undefined, year: number) {
  const departmentIds = await scopeOf(staffId);
  if (departmentIds.length === 0) return [];

  const departments = await db.department.findMany({
    where: { id: { in: departmentIds } },
    select: {
      id: true,
      name: true,
      faculty: { select: { name: true } },
      primaryStaff: {
        where: { ...ON_ROSTER, isNpp: true },
        select: {
          id: true,
          lastName: true,
          firstName: true,
          patronymic: true,
          academicRank: true,
          scientificDegree: true,
          ratingEntries: { where: { year }, select: { totalScore: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    faculty: d.faculty.name,
    staff: d.primaryStaff
      .map((s) => ({
        id: s.id,
        name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
        academicRank: s.academicRank,
        scientificDegree: s.scientificDegree,
        total: s.ratingEntries[0]?.totalScore ?? 0,
      }))
      // The ranking order, same as /rating — it is the order the ставка formula
      // spreads a pool in, so it is the order a head already thinks in.
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'uk')),
  }));
}

export type MyDepartment = Awaited<ReturnType<typeof listMyDepartments>>[number];
