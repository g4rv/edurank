import { db } from '@/lib/db';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import { ON_ROSTER } from './roster';
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

  const [stakes, knpp, allocations] = await Promise.all([
    db.departmentStake.findMany({
      where: { year },
      select: { departmentId: true, kstHundredths: true, bonusPoolHundredths: true },
    }),
    getDepartmentsKnpp(
      departments.map((d) => d.id),
      year
    ),
    // What each кафедра has actually handed out, so the overview can show a
    // remainder per row. One grouped read rather than a query per кафедра —
    // this page lists all 31 and would otherwise be 31 round trips.
    //
    // Scoped to the year, like every other read here. Without the filter the
    // aggregate walked every allocation the university has ever recorded to
    // answer a question about 31 rows of the current one — right, and a little
    // more wrong with each year that closes.
    db.stakeAllocation.groupBy({
      by: ['distributionId'],
      // `ON_ROSTER`, because `/stakes/[id]` sums only the rows it shows and it
      // shows only the roster. Without it the two screens disagreed the moment
      // anybody was archived: this page went on counting their ставка while the
      // кафедра's own grid did not, so one кафедра had two «Залишок» values —
      // 0,40 here against 0,70 there (2026-08-27, seen on screen). The row was
      // even inconsistent with itself, since `headcount` below comes from
      // `getDepartmentsKnpp`, which HAS always excluded them: four people, and
      // money for five.
      //
      // Their `StakeAllocation` row is deliberately left in the database — it
      // is what that year's розподіл actually was, and archiving never destroys
      // history. This only stops the row being counted as still spent.
      //
      // **It redistributes nothing.** The freed share shows up as «Залишок» and
      // stays there until a head or the проректор decides where it goes (owner,
      // 2026-08-27).
      where: { distribution: { year }, staff: ON_ROSTER },
      _sum: { proposedHundredths: true },
    }),
  ]);

  const distributions = await db.stakeDistribution.findMany({
    where: { year },
    select: { id: true, departmentId: true },
  });
  // Indexed once rather than scanned per кафедра — the same answer without
  // walking the allocation list 31 times.
  const sumByDistribution = new Map(
    allocations.map((a) => [a.distributionId, a._sum.proposedHundredths ?? 0])
  );
  const distributedByDepartment = new Map(
    distributions.map((d) => [d.departmentId, sumByDistribution.get(d.id) ?? 0])
  );

  const stakeByDepartment = new Map(stakes.map((s) => [s.departmentId, s]));
  const knppByDepartment = new Map(knpp.map((k) => [k.departmentId, k]));

  return departments.map((d) => {
    const counts = knppByDepartment.get(d.id);
    const headcount = counts?.headcount ?? 0;
    const stake = stakeByDepartment.get(d.id);
    const kstHundredths = stake?.kstHundredths ?? null;
    const bonusPoolHundredths = stake?.bonusPoolHundredths ?? null;
    const distributedHundredths = distributedByDepartment.get(d.id) ?? 0;
    const minimumHundredths = minimumKstHundredths(headcount);

    return {
      id: d.id,
      name: d.name,
      faculty: d.faculty.name,
      headcount,
      knpp: counts?.knpp ?? 0,
      kstHundredths,
      bonusPoolHundredths,
      distributedHundredths,
      /**
       * What is left of BOTH pools together — the figure the overview leads
       * with, because a проректор scanning 31 rows wants one number per кафедра
       * and the split on hover.
       *
       * Null when no `Кст` is set: «нерозподілено» of a pool that does not exist
       * is not zero, it is unanswerable, and printing 0,00 would read as «all
       * spent».
       */
      remainingHundredths:
        kstHundredths === null
          ? null
          : kstHundredths + (bonusPoolHundredths ?? 0) - distributedHundredths,
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

/**
 * What each administrative position is worth this year, in hundredths.
 *
 * Every position is returned, priced or not — ADMIN needs to see the whole list
 * to set it, and the grid's tooltip shows all seven with a tick on the one that
 * counts. A missing row means «not priced», which is zero for arithmetic and
 * «—» on screen; the two must stay distinguishable.
 */
export async function listStatusBonuses(year: number): Promise<Map<AdminPosition, number>> {
  const rows = await db.stakeStatusBonus.findMany({
    where: { year },
    select: { position: true, valueHundredths: true },
  });
  return new Map(rows.map((r) => [r.position, r.valueHundredths]));
}

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
