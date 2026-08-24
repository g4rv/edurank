import { db } from '@/lib/db';
import { activeYear } from './get-active-template';

export interface StakePart {
  departmentId: string;
  department: string;
  hundredths: number;
}

/**
 * Where one person's ставка came from, кафедра by кафедра.
 *
 * `Staff.employmentRate` is **not** a hand-typed contract rate: `saveDistribution`
 * writes it from the head's own number, and since 2026-08-24 it holds the SUM
 * across every кафедра that pays this person. This is the breakdown of that
 * figure — «Кафедра ботаніки — 0,90 + Кафедра екології — 0,25» — read from the
 * same allocations the sum was computed from, so the parts always add up to the
 * whole.
 *
 * Empty until a head fills their grid, and the caller renders nothing then: a
 * кафедра nobody has spread yet is not a кафедра paying 0,00.
 *
 * Their own кафедра comes first, so the note reads «основна + додаткова».
 *
 * Its own query rather than a widening of `getStaff`, which has eight callers
 * that do not want an extra join for a figure only two pages show.
 */
export async function getStakeBreakdown(staffId: string): Promise<StakePart[]> {
  const year = await activeYear();
  if (year === null) return [];

  const [person, allocations] = await Promise.all([
    db.staff.findUnique({ where: { id: staffId }, select: { departmentId: true } }),
    db.stakeAllocation.findMany({
      where: { staffId, distribution: { year } },
      select: {
        proposedHundredths: true,
        distribution: { select: { department: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return allocations
    .map((a) => ({
      departmentId: a.distribution.department.id,
      department: a.distribution.department.name,
      hundredths: a.proposedHundredths,
    }))
    .sort(
      (a, b) =>
        Number(b.departmentId === person?.departmentId) -
          Number(a.departmentId === person?.departmentId) ||
        a.department.localeCompare(b.department, 'uk')
    );
}
