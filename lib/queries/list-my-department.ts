import { db } from '@/lib/db';
import { ON_ROSTER, onDepartments } from './roster';
import { scopeOf } from './scope';
import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';

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
 *
 * **Сумісники appear under every кафедра that pays them** (2026-08-24), which
 * is why this reads staff separately instead of through the `primaryStaff`
 * relation: a relation can express neither «or a сумісник here» nor «this
 * person, under BOTH кафедри» — it would return them once, under whichever
 * кафедра owned the relation.
 */
interface MyDepartmentStaff {
  id: string;
  name: string;
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  total: number;
  /** This кафедра is their ADDITIONAL one — badge and sort key off it */
  isPartTime: boolean;
}

export async function listMyDepartments(staffId: string | null | undefined, year: number) {
  const departmentIds = await scopeOf(staffId);
  if (departmentIds.length === 0) return [];

  const [departments, staff] = await Promise.all([
    db.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true, faculty: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, ...onDepartments(departmentIds) },
      select: {
        id: true,
        departmentId: true,
        partTimeDepartments: { select: { departmentId: true } },
        lastName: true,
        firstName: true,
        patronymic: true,
        academicRank: true,
        scientificDegree: true,
        ratingEntries: { where: { year }, select: { totalScore: true } },
      },
    }),
  ]);

  const inScope = new Set(departmentIds);
  const byDepartment = new Map<string, MyDepartmentStaff[]>();
  for (const id of departmentIds) byDepartment.set(id, []);

  for (const s of staff) {
    const person = {
      id: s.id,
      name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
      academicRank: s.academicRank,
      scientificDegree: s.scientificDegree,
      total: s.ratingEntries[0]?.totalScore ?? 0,
    };

    if (s.departmentId && inScope.has(s.departmentId)) {
      byDepartment.get(s.departmentId)!.push({ ...person, isPartTime: false });
    }
    for (const { departmentId } of s.partTimeDepartments) {
      // Their own кафедра is already handled above, and a кафедра outside this
      // head's scope is none of their business even though the row is real.
      if (departmentId === s.departmentId || !inScope.has(departmentId)) continue;
      byDepartment.get(departmentId)!.push({ ...person, isPartTime: true });
    }
  }

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    faculty: d.faculty.name,
    // Сумісники as a block at the bottom, then the ranking order — which is the
    // order the ставка formula spreads a pool in, so it is the order a head
    // already thinks in. Name as the final tie-break so it never wobbles.
    staff: (byDepartment.get(d.id) ?? []).sort(
      (a, b) =>
        Number(a.isPartTime) - Number(b.isPartTime) ||
        b.total - a.total ||
        a.name.localeCompare(b.name, 'uk')
    ),
  }));
}

export type MyDepartment = Awaited<ReturnType<typeof listMyDepartments>>[number];
