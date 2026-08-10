import { db } from '@/lib/db';
import { getDepartmentsKnpp } from './get-department-knpp';
import { DEFAULT_CONTRACT_COEFFICIENT } from '@/lib/stake/norms';
import { minimumKstHundredths } from '@/lib/stake/units';

/**
 * The year's ставка settings, everything ADMIN can set in one read.
 *
 * `Кст` is shown beside the кафедра's own minimum, because the two only make
 * sense together: a pool is not «2.00», it is «2.00 against a floor of 1.80 for
 * 18 people». Showing the number alone is how the 2025 file ended up with two
 * кафедри at zero.
 */
export async function listDepartmentStakes(year: number) {
  const departments = await db.department.findMany({
    select: {
      id: true,
      name: true,
      faculty: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const [stakes, knpp] = await Promise.all([
    db.departmentStake.findMany({
      where: { year },
      select: { departmentId: true, kstHundredths: true },
    }),
    getDepartmentsKnpp(
      departments.map((d) => d.id),
      year
    ),
  ]);

  const kstByDepartment = new Map(stakes.map((s) => [s.departmentId, s.kstHundredths]));
  const knppByDepartment = new Map(knpp.map((k) => [k.departmentId, k]));

  return departments.map((d) => {
    const counts = knppByDepartment.get(d.id);
    const headcount = counts?.headcount ?? 0;
    const kstHundredths = kstByDepartment.get(d.id) ?? null;
    const minimumHundredths = minimumKstHundredths(headcount);

    return {
      id: d.id,
      name: d.name,
      faculty: d.faculty.name,
      headcount,
      knpp: counts?.knpp ?? 0,
      kstHundredths,
      minimumHundredths,
      /**
       * A pool saved before somebody joined the кафедра can fall under the
       * floor without anybody touching it. The spec asks for that to surface on
       * screen rather than fail silently later, so it is computed here and not
       * only at save time.
       */
      belowMinimum: kstHundredths !== null && kstHundredths < minimumHundredths,
    };
  });
}

export type DepartmentStakeRow = Awaited<ReturnType<typeof listDepartmentStakes>>[number];

/** The норматив table for one year, with the speciality it belongs to */
export async function listSpecialityNorms(year: number) {
  const specialities = await db.speciality.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      norms: { where: { year }, select: { base: true } },
    },
    orderBy: { name: 'asc' },
  });

  return specialities.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    // Null means the вчена рада has not set one for this year yet — different
    // from zero, and a student of that speciality is worth nothing until it is.
    base: s.norms[0]?.base ?? null,
  }));
}

export type SpecialityNormRow = Awaited<ReturnType<typeof listSpecialityNorms>>[number];

/** The year's settings, falling back to the confirmed 2026 defaults */
export async function getStakeYearSettings(year: number) {
  const row = await db.stakeYearSettings.findUnique({ where: { year } });
  return {
    year,
    contractCoefficient: row?.contractCoefficient ?? DEFAULT_CONTRACT_COEFFICIENT,
    /** False = nobody has confirmed the year yet; the value shown is a default */
    saved: row !== null,
  };
}
