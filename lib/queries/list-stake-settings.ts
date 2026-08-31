import { db } from '@/lib/db';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import { ON_ROSTER, onDepartments } from './roster';
import { DEFAULT_LIMITS, PART_TIME_LIMITS, formulaShares } from '@/lib/stake/formula';
import { openingStake } from '@/lib/stake/settle';
import { ratingYearFor } from '@/lib/stake/rating-year';
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
  // Ставки are spread on the PREVIOUS year's rating — the server-side rule, not
  // a setting. The same call `getStakeDistribution` makes, so both screens feed
  // the формула the same scores.
  //
  // Beside `departments` rather than before it: nothing about the кафедри
  // depends on the year, so awaiting them in turn just added a round trip to
  // every load of this page.
  const [ratingYear, departments] = await Promise.all([
    ratingYearFor(year),
    db.department.findMany({
      select: {
        id: true,
        name: true,
        faculty: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const [stakes, knpp, allocations, roster, distributions] = await Promise.all([
    db.departmentStake.findMany({
      where: { year },
      select: { departmentId: true, kstHundredths: true, bonusPoolHundredths: true },
    }),
    getDepartmentsKnpp(
      departments.map((d) => d.id),
      year
    ),
    // What each кафедра has actually handed out, so the overview can show a
    // remainder per row. One read rather than a query per кафедра — this page
    // lists all 31 and would otherwise be 31 round trips.
    //
    // Scoped to the year, like every other read here. Without the filter it
    // walked every allocation the university has ever recorded to answer a
    // question about 31 rows of the current one — right, and a little more
    // wrong with each year that closes.
    //
    // `findMany`, not `groupBy`: the row's WHO is needed as well as its HOW
    // MUCH. A кафедра can show a person the формула drew and nobody stored, and
    // telling that from a saved row needs the ids, not a sum (see
    // `unsavedCount` below). Still one read for all 31 кафедри, and the sums are
    // added here — every value is an integer hundredth, so JS addition is exact.
    db.stakeAllocation.findMany({
      // `formulaHundredths` is the формула FROZEN at the last human save — the
      // «тільки збільшити» floor `openingStake` measures against. Reading
      // today's instead would drag that floor up under people nobody touched,
      // which is the bug of 2026-08-27 reintroduced on a second screen.
      select: {
        distributionId: true,
        staffId: true,
        proposedHundredths: true,
        formulaHundredths: true,
      },
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
    }),
    // The кафедра's roster, with everything needed to reproduce what its own
    // grid SHOWS — rating for the формула, bounds for the clamp. Сумісники
    // included, so «who is on this кафедра» is answered the way `onDepartment`
    // answers it and not by `departmentId` alone.
    //
    // `stakeLimits` is NOT scoped to one кафедра here, unlike in
    // `getStakeDistribution`: that reads one кафедра, this reads all 31, and a
    // сумісник holds a different pair of bounds on each. They are indexed by
    // `staffId + departmentId` below, so the 0,25 ceiling of an additional
    // кафедра never leaks onto somebody's own.
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, ...onDepartments(departments.map((d) => d.id)) },
      select: {
        id: true,
        departmentId: true,
        partTimeDepartments: { select: { departmentId: true } },
        ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
        stakeLimits: {
          where: { year },
          select: { departmentId: true, minHundredths: true, maxHundredths: true },
        },
      },
    }),
    // Which distribution row belongs to which кафедра — the join between the
    // allocations above and the кафедри below. Depends on nothing but the year,
    // so it sits in this batch rather than costing its own round trip after it.
    db.stakeDistribution.findMany({
      where: { year },
      select: { id: true, departmentId: true },
    }),
  ]);

  // Indexed once rather than scanned per кафедра — the same answer without
  // walking the allocation list 31 times.
  const departmentOfDistribution = new Map(distributions.map((d) => [d.id, d.departmentId]));

  /** The stored allocation for one person on one кафедра, keyed «staffId@departmentId» */
  const allocationByPerson = new Map<
    string,
    { proposedHundredths: number; formulaHundredths: number }
  >();
  /** Who already HAS a stored ставка on this кафедра, this year */
  const allocatedByDepartment = new Map<string, Set<string>>(
    distributions.map((d) => [d.departmentId, new Set<string>()])
  );
  for (const a of allocations) {
    const departmentId = departmentOfDistribution.get(a.distributionId);
    if (!departmentId) continue;
    allocationByPerson.set(`${a.staffId}@${departmentId}`, a);
    allocatedByDepartment.get(departmentId)?.add(a.staffId);
  }

  /** Who the кафедра's grid draws a row for — primary post or сумісництво */
  const rosterByDepartment = new Map<string, typeof roster>();
  for (const person of roster) {
    for (const departmentId of [
      person.departmentId,
      ...person.partTimeDepartments.map((p) => p.departmentId),
    ]) {
      if (departmentId === null) continue;
      const list = rosterByDepartment.get(departmentId) ?? [];
      list.push(person);
      rosterByDepartment.set(departmentId, list);
    }
  }

  /**
   * How many people the кафедра's grid shows with nothing stored behind them.
   *
   * The two screens now print the SAME «Залишок» — see `displayedByDepartment`
   * below — so this no longer marks a disagreement. It marks that the agreed
   * number is **provisional**: it counts ставки the формула drew and no human
   * has committed, and they will move when the завідувач actually decides.
   *
   * Kept for that reason and not dropped with the mismatch it was written for.
   * A проректор allocating against this кафедра should know the figure is not
   * yet anybody's decision — the grid says «Незбережені зміни» to the head, and
   * this is the same fact said to the other person who acts on it.
   */
  const unsavedByDepartment = new Map<string, number>();
  for (const person of roster) {
    const on = [
      person.departmentId,
      ...person.partTimeDepartments.map((p) => p.departmentId),
    ].filter((id): id is string => id !== null);
    for (const departmentId of on) {
      if (allocatedByDepartment.get(departmentId)?.has(person.id)) continue;
      unsavedByDepartment.set(departmentId, (unsavedByDepartment.get(departmentId) ?? 0) + 1);
    }
  }

  /**
   * «Розподілено» — THE NUMBER THE КАФЕДРА'S OWN GRID SHOWS, not the stored sum.
   *
   * This page used to add up `StakeAllocation` rows. `/stakes/[id]` adds up what
   * is on its screen, which for anybody кадри added since the last save is the
   * формула's proposal rather than a stored row — so the two printed different
   * «Залишок» for the same кафедра on the same day: 3,75 here against 2,75
   * there on Кафедра цифрових технологій, a whole ставка apart, with the
   * проректор reading the larger one and able to allocate money the кафедра had
   * already spent on screen (2026-08-31).
   *
   * They agree now **by construction**, not by two sums being kept in step:
   * `openingStake` is the single rule for what a row shows, and both screens
   * call it. Everything fed into it is assembled the way `getStakeDistribution`
   * assembles it — same rostering, same per-кафедра bounds fallback, same
   * формула — because a difference in any of those reopens exactly this gap.
   *
   * `unsavedCount` above still marks the кафедра, so the number being provisional
   * is visible rather than merely correct.
   */
  const displayedByDepartment = new Map<string, number>();
  for (const department of departments) {
    const people = rosterByDepartment.get(department.id) ?? [];
    if (people.length === 0) continue;

    const stake = stakes.find((s) => s.departmentId === department.id);
    const kstHundredths = stake?.kstHundredths ?? null;

    // The bounds fallback differs by row type and never crosses кафедри: a
    // сумісник with no row of their own gets 0,10–0,25, not whatever ADMIN
    // typed for them on their primary кафедра.
    const boundsFor = (p: (typeof people)[number]) => {
      const own = p.stakeLimits.find((l) => l.departmentId === department.id);
      const fallback = p.departmentId === department.id ? DEFAULT_LIMITS : PART_TIME_LIMITS;
      return {
        minHundredths: own?.minHundredths ?? fallback.minHundredths,
        maxHundredths: own?.maxHundredths ?? fallback.maxHundredths,
      };
    };

    const formula = formulaShares({
      people: people.map((p) => ({
        staffId: p.id,
        rating: p.ratingEntries[0]?.totalScore ?? 0,
        ...boundsFor(p),
      })),
      kstHundredths: kstHundredths ?? 0,
    });
    const shareByStaff = new Map(formula.shares.map((s) => [s.staffId, s]));

    const formulaOverspends =
      kstHundredths !== null &&
      formula.totalHundredths > kstHundredths + (stake?.bonusPoolHundredths ?? 0);

    let total = 0;
    for (const person of people) {
      const share = shareByStaff.get(person.id);
      if (!share) continue;
      const allocation = allocationByPerson.get(`${person.id}@${department.id}`);
      total += openingStake(
        {
          rating: share.rating,
          ...boundsFor(person),
          formulaHundredths: share.hundredths,
          savedFormulaHundredths: allocation?.formulaHundredths ?? null,
          // Until somebody saves, the формула's proposal IS the proposal — the
          // same fallback `getStakeDistribution` applies.
          proposedHundredths: allocation?.proposedHundredths ?? share.hundredths,
        },
        formulaOverspends
      );
    }
    displayedByDepartment.set(department.id, total);
  }

  const stakeByDepartment = new Map(stakes.map((s) => [s.departmentId, s]));
  const knppByDepartment = new Map(knpp.map((k) => [k.departmentId, k]));

  return departments.map((d) => {
    const counts = knppByDepartment.get(d.id);
    const headcount = counts?.headcount ?? 0;
    const stake = stakeByDepartment.get(d.id);
    const kstHundredths = stake?.kstHundredths ?? null;
    const bonusPoolHundredths = stake?.bonusPoolHundredths ?? null;
    const distributedHundredths = displayedByDepartment.get(d.id) ?? 0;
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
       * People on this кафедра with no stored ставка. Zero for a кафедра that is
       * fully spread — and for one nobody has started, where `Кст` is null and
       * the row says «—» anyway. Non-zero means «Залишок» beside it is larger
       * than what the завідувач's own screen already shows as spent.
       */
      unsavedCount: unsavedByDepartment.get(d.id) ?? 0,
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
      departments: { select: { department: { select: { id: true, name: true } } } },
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
    // Which кафедри graduate it — editable on this same page (Task 8).
    departments: s.departments.map((d) => d.department),
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
