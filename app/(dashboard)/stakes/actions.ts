'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { ON_ROSTER } from '@/lib/queries/roster';
import { headOf } from '@/lib/queries/scope';
import { DEFAULT_LIMITS, formulaShares } from '@/lib/stake/formula';
import { MIN_STAKE, STAKE_STEP, floorToStep, formatStake } from '@/lib/stake/units';
import { ratingYearFor } from '@/lib/stake/rating-year';
import { closedYearProblem } from '@/lib/stake/writable-year';
import { staffStakeLimitsSchema } from '@/validations/stake';
import type { Role } from '@/lib/generated/prisma/client';

export type DistributionState = { error: string } | { success: true } | null;

/**
 * What `setStaffLimits` hands back.
 *
 * `formulaHundredths` is this person's share recomputed against the bounds that
 * were just saved. The grid needs it: a lower Макс makes the formula propose
 * less, and the ставка in the field has to follow — otherwise the row is left
 * holding a number the next save will refuse. Returning it beats making the
 * client wait for a refresh and then diff the props, which is a re-render loop
 * dressed up as reconciliation.
 */
export type LimitsState =
  | { error: string }
  | { success: true; formulaHundredths: number | null }
  | null;

/**
 * Who may spread a кафедра's pool: its завідувач, and ADMIN.
 *
 * Headship comes from `Department.headId`, never from a `Role` — one person is
 * routinely a head, an НПП and a division editor at once.
 *
 * **ADMIN is here, provisionally** (2026-08-13). It was closed on 2026-08-12 so
 * that «завідувач розподіляє» was true of the code and not only of the
 * положення.
 * The owner reopened it: they are unsure, the вице-ректор who actually holds
 * the account has never been asked, and the argument for read-only («inspect,
 * then phone the head») is one they find plausible. Until that is settled the
 * looser rule stands, with two things making it visible rather than quiet:
 * `StakeDistribution.filledBy` records who typed it, and the grid warns ADMIN
 * before they overwrite a split a head has already saved. Closing it again is
 * this function plus `canEditAllocation` on the page.
 *
 * Two exclusions remain:
 *
 * - **A декан** oversees every кафедра of their faculty and may read all of it
 *   — `scopeOf` grants that — but retyping a split would be doing the head's
 *   job over their head. Hence `headOf`, not `scopeOf`.
 * - **EDITOR**, and never otherwise. A division editor may read any rating
 *   (W6); deciding who on a кафедра is paid what is not reading.
 */
async function canDistribute(
  user: { role: Role; staffId?: string | null },
  departmentId: string
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  return (await headOf(user.staffId)).includes(departmentId);
}

const allocationSchema = z.object({
  staffId: z.string().min(1),
  hundredths: z.number().int().min(0),
});

const savePayloadSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  allocations: z.array(allocationSchema).min(1),
});

function revalidateStakes(departmentId: string) {
  revalidatePath('/stakes');
  revalidatePath(`/departments/${departmentId}`);
  revalidatePath('/my-department');
}

/**
 * Saves the whole кафедра at once.
 *
 * One save for the set rather than one per row, because the ceiling is a
 * property of the set: a head moving 0.10 from one person to another would be
 * blocked on the first half of the move if rows saved independently.
 *
 * Everything is re-derived and re-checked here, and the list is worth naming
 * because it used to be shorter than this sentence claimed: the person's
 * Мін/Макс, the 0,05 ladder, and «тільки збільшити» — nothing may be saved
 * below what the формула proposes for that person. The формула itself is
 * recomputed from the roster, never taken from the payload.
 *
 * The client computes the same numbers to keep the grid live, but a client
 * total is a hint, not a fact. This is where they are enforced.
 */
export async function saveDistribution(payload: unknown): Promise<DistributionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const parsed = savePayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані форми' };
  const { departmentId, year, allocations } = parsed.data;

  if (!(await canDistribute(session.user, departmentId))) {
    return { error: 'Розподіл зберігає завідувач кафедри' };
  }

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  // Same rule the page ran, run again here rather than taken from the payload:
  // this action recomputes «за формулою» and stores it beside the head's
  // number, so a year that arrived from the browser could file a split the
  // screen never showed.
  const ratingYear = await ratingYearFor(year);

  const [department, stake, staff] = await Promise.all([
    db.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
    db.departmentStake.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { kstHundredths: true, bonusPoolHundredths: true },
    }),
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, departmentId },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
        stakeLimits: { where: { year }, select: { minHundredths: true, maxHundredths: true } },
      },
    }),
  ]);

  if (!department) return { error: 'Кафедру не знайдено' };
  if (!stake) {
    // Without a pool there is nothing to spread, and a distribution saved
    // against no Кст could not be checked against anything later.
    return { error: 'Для цієї кафедри ще не встановлено Кст. Зверніться до адміністратора' };
  }

  // Recomputed server-side, not taken from the client: додаток 2 prints the
  // formula's number beside the head's, so storing the head's in both columns
  // would make the document assert that they agreed when they did not.
  const formula = formulaShares({
    people: staff.map((s) => ({
      staffId: s.id,
      rating: s.ratingEntries[0]?.totalScore ?? 0,
      minHundredths: s.stakeLimits[0]?.minHundredths ?? DEFAULT_LIMITS.minHundredths,
      maxHundredths: s.stakeLimits[0]?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths,
    })),
    kstHundredths: stake.kstHundredths,
  });
  const formulaByStaff = new Map(formula.shares.map((s) => [s.staffId, s.hundredths]));

  const byId = new Map(staff.map((s) => [s.id, s]));

  // Everyone on the roster must appear, and nobody else may. A missing row is
  // somebody quietly left out of the distribution, which is the same as paying
  // them nothing — and nobody may end on zero.
  if (allocations.length !== staff.length) {
    return { error: 'Список НПП змінився. Оновіть сторінку та спробуйте ще раз' };
  }

  // Already past both funds — the floor check below explains why that matters.
  const funds = stake.kstHundredths + (stake.bonusPoolHundredths ?? 0);
  const overspent = allocations.reduce((sum, a) => sum + a.hundredths, 0) > funds;

  for (const allocation of allocations) {
    const person = byId.get(allocation.staffId);
    if (!person) {
      return { error: 'Список НПП змінився. Оновіть сторінку та спробуйте ще раз' };
    }

    const limits = person.stakeLimits[0];
    // **Zero rating removes the floor** (owner, 2026-08-18). It exists so that
    // nobody who works is left without a ставка, and `formulaShares` already
    // read it that way — it proposes 0 for anyone with no rating and skips the
    // floor. This check did not, so the formula offered a number the save then
    // refused, and a кафедра with an inactive НПП had a row nobody could store.
    const rating = person.ratingEntries[0]?.totalScore ?? 0;
    const min =
      rating > 0 ? Math.max(limits?.minHundredths ?? DEFAULT_LIMITS.minHundredths, MIN_STAKE) : 0;
    const max = Math.max(limits?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths, min);
    const who = `${person.lastName} ${person.firstName}`;

    // Каps are absolute — in the whole 2025 distribution nobody exceeds theirs.
    if (allocation.hundredths < min) {
      return { error: `${who}: ставка не може бути меншою за ${formatStake(min)}` };
    }
    if (allocation.hundredths > max) {
      return { error: `${who}: ставка не може перевищувати ${formatStake(max)}` };
    }
    if (allocation.hundredths % STAKE_STEP !== 0) {
      return { error: `${who}: ставка має бути кратною 0,05` };
    }

    // «Початкову (автоматичну) ставку можна тільки збільшити» — the sheet's own
    // rule, and the owner restating it (2026-08-19): the формула calculates, the
    // завідувач adjusts, and nobody types a number below it. The ONE way a ставка
    // comes down is ADMIN moving that person’s Мін/Макс, which changes what the
    // формула itself proposes.
    //
    // The grid has enforced this since it was written (`settleStake`). The server
    // did not — while its own docstring said it re-checked everything the client
    // computed — so додаток 2 could print a distributed number under the formula
    // column with no обґрунтування, which is the deviation the положення exists to
    // make somebody justify.
    //
    // Lifted while the кафедра is over both funds, or there is no way out of an
    // overspend: a head may only raise, and ladder rounding alone can put the
    // formula’s own proposal above `Кст`. A hard floor then leaves no legal move at
    // all — Кафедра географії sat in exactly that state, 2,10 against a pool of 2,00.
    const floor = formulaByStaff.get(allocation.staffId) ?? 0;
    if (!overspent && allocation.hundredths < floor) {
      return {
        error:
          `${who}: ставка не може бути меншою за ${formatStake(floor)} — стільки дає формула. ` +
          'Зменшити можна лише через Мін/Макс',
      };
    }
  }

  // Overspending the pool is ALLOWED, and shown rather than refused — the
  // university's own sheet does the same, turning «не розподілено» red beside
  // «не забудьте врахувати у протоколі» (2026-08-12).
  //
  // Refusing was not a stricter version of that, it was a deadlock. A head may
  // only raise a value above the formula, never lower it, and the proposal can
  // already sit a few hundredths over `Кст` from ladder rounding alone — so
  // with a hard block there was nothing they could legally do to the grid at
  // all. Кафедра географії was in exactly that state: 2.10 proposed against a
  // pool of 2.00, unsaveable.
  //
  // Where the number is settled is the протокол, not this input.

  // No обґрунтування. Додаток 2 prints the column and the положення describes
  // justifying a deviation, but the university says nobody will ever fill it in
  // (2026-08-12), and a field nobody completes is worse than no field: it takes
  // a column of the widest screen and teaches people that empty is normal. The
  // `StakeAllocation.justification` column is left in the database, unused and
  // nullable, so the text already typed is not destroyed by this decision.

  try {
    await db.$transaction(async (tx) => {
      const distribution = await tx.stakeDistribution.upsert({
        where: { departmentId_year: { departmentId, year } },
        update: { filledAt: new Date(), filledById: session.user.id },
        create: {
          departmentId,
          year,
          filledAt: new Date(),
          filledById: session.user.id,
        },
        select: { id: true },
      });

      const previous = await tx.stakeAllocation.findMany({
        where: { distributionId: distribution.id },
        select: { staffId: true, proposedHundredths: true },
      });
      const previousByStaff = new Map(previous.map((p) => [p.staffId, p.proposedHundredths]));

      // Replace the set wholesale: the roster may have changed since the last
      // save, and a stale row for somebody now archived would keep counting.
      await tx.stakeAllocation.deleteMany({ where: { distributionId: distribution.id } });
      await tx.stakeAllocation.createMany({
        data: allocations.map((a) => ({
          distributionId: distribution.id,
          staffId: a.staffId,
          // Frozen beside the head's number because додаток 2 prints the two
          // side by side — the document IS the comparison.
          formulaHundredths: formulaByStaff.get(a.staffId) ?? 0,
          proposedHundredths: a.hundredths,
        })),
      });

      // One entry for the кафедра, not one per person: the distribution is a
      // single decision, and 18 log lines would bury it.
      await tx.auditLog.create({
        data: {
          action: previous.length > 0 ? 'UPDATE' : 'CREATE',
          entity: 'StakeDistribution',
          entityId: distribution.id,
          label: `${department.name} — розподіл ставок ${year}`,
          userId: session.user.id,
          changes: diffChanges(
            Object.fromEntries(
              allocations.map((a) => [
                byId.get(a.staffId)?.lastName ?? a.staffId,
                previousByStaff.get(a.staffId) ?? null,
              ])
            ),
            Object.fromEntries(
              allocations.map((a) => [byId.get(a.staffId)?.lastName ?? a.staffId, a.hundredths])
            )
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти розподіл. Зміни не застосовано',
        'stake.saveDistribution',
        { userId: session.user.id, entityId: departmentId }
      ),
    };
  }

  revalidateStakes(departmentId);
  return { success: true };
}

/**
 * One person's floor and ceiling. **ADMIN only** — a завідувач distributes
 * inside limits they cannot change, which is what stops a head capping
 * colleagues down and themselves up (decided 2026-08-05).
 */
export async function setStaffLimits(_prev: LimitsState, formData: FormData): Promise<LimitsState> {
  const session = await auth();
  if (!session) redirect('/login');
  // Not `canDistribute`: a head may spread the pool but never move the bounds
  // they are spreading it inside.
  if (session.user.role !== 'ADMIN') return { error: 'Ліміти змінює лише адміністратор' };

  const parsed = staffStakeLimitsSchema.safeParse({
    staffId: formData.get('staffId'),
    year: Number(formData.get('year')),
    minHundredths: formData.get('min'),
    maxHundredths: formData.get('max'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  }
  const { staffId, year, minHundredths, maxHundredths } = parsed.data;

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  const person = await db.staff.findUnique({
    where: { id: staffId },
    select: { lastName: true, firstName: true, patronymic: true, departmentId: true },
  });
  if (!person) return { error: 'Працівника не знайдено' };

  try {
    const existing = await db.staffStakeLimits.findUnique({
      where: { staffId_year: { staffId, year } },
      select: { minHundredths: true, maxHundredths: true },
    });

    const row = await db.staffStakeLimits.upsert({
      where: { staffId_year: { staffId, year } },
      update: { minHundredths, maxHundredths },
      create: { staffId, year, minHundredths, maxHundredths },
    });

    await db.auditLog.create({
      data: {
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'StaffStakeLimits',
        entityId: row.id,
        label: `${person.lastName} ${person.firstName} ${person.patronymic} — ліміти ставки ${year}`,
        userId: session.user.id,
        changes: diffChanges(
          {
            minHundredths: existing?.minHundredths ?? null,
            maxHundredths: existing?.maxHundredths ?? null,
          },
          { minHundredths, maxHundredths }
        ),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти ліміти. Зміни не застосовано',
        'stake.setLimits',
        {
          userId: session.user.id,
          entityId: staffId,
        }
      ),
    };
  }

  if (!person.departmentId) return { success: true, formulaHundredths: null };
  revalidateStakes(person.departmentId);

  // The share handed back has to be ranked on the same year the grid is showing
  const ratingYear = await ratingYearFor(year);

  // Recomputed with the bounds that were just written, for the row the grid has
  // to move. Whole-кафедра, because both passes of the formula divide by sums
  // over everyone — one person's cap changes what every share comes to.
  const [stake, roster] = await Promise.all([
    db.departmentStake.findUnique({
      where: { departmentId_year: { departmentId: person.departmentId, year } },
      select: { kstHundredths: true },
    }),
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, departmentId: person.departmentId },
      select: {
        id: true,
        ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
        stakeLimits: { where: { year }, select: { minHundredths: true, maxHundredths: true } },
      },
    }),
  ]);
  if (!stake) return { success: true, formulaHundredths: null };

  const formula = formulaShares({
    people: roster.map((s) => ({
      staffId: s.id,
      rating: s.ratingEntries[0]?.totalScore ?? 0,
      minHundredths: s.stakeLimits[0]?.minHundredths ?? DEFAULT_LIMITS.minHundredths,
      maxHundredths: s.stakeLimits[0]?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths,
    })),
    kstHundredths: stake.kstHundredths,
  });

  await liftStoredAllocations(person.departmentId, year, roster, formula.shares, session.user.id);

  return {
    success: true,
    formulaHundredths: formula.shares.find((x) => x.staffId === staffId)?.hundredths ?? null,
  };
}

/**
 * Bring a кафедра's saved split back inside the bounds a cap change just moved.
 *
 * One person's Мін/Макс moves what the формула proposes for EVERYBODY — both
 * passes divide by sums over the whole roster — and since 2026-08-19 the
 * формула is a floor the server refuses to save under. So after a cap is
 * written, a stored allocation below its new floor is not merely stale: it is a
 * number `saveDistribution` would now reject, sitting in the database with
 * nothing to announce it.
 *
 * It used to be left there. The grid claimed its `key` remounted it with the
 * recomputed numbers, which was not true — `departmentId` alone does not change
 * across a refresh — so the client corrected the ONE row that had been edited
 * and the rest kept their old figures against a formula that had moved beneath
 * them.
 *
 * Mechanical, not a decision, which is why ADMIN may trigger it without doing
 * the head's job:
 *
 * - **Up to the floor only.** A raise the завідувач typed on top of the formula
 *   stays exactly where they put it — `Math.max` keeps the larger of the two.
 * - **Down to the ceiling.** A value above somebody's new Макс has to come down;
 *   that is the red unsaveable row the grid used to open on.
 * - **`formulaHundredths` is rewritten too.** Додаток 2 prints it beside the
 *   head's number, and a frozen column claiming the old proposal would make the
 *   document assert a comparison that never happened.
 *
 * **Logged, because it is pay that moved.** ADMIN edits a cap and somebody
 * else's ставка changes as a consequence; without an entry the log would show
 * the cap and stay silent about the money, which is the one thing an audit log
 * exists to stop. One entry for the кафедра, like `saveDistribution`, listing
 * only the rows that actually moved.
 */
async function liftStoredAllocations(
  departmentId: string,
  year: number,
  roster: { id: string; ratingEntries: { totalScore: number }[] }[],
  shares: { staffId: string; hundredths: number }[],
  userId: string
): Promise<void> {
  const distribution = await db.stakeDistribution.findUnique({
    where: { departmentId_year: { departmentId, year } },
    select: {
      id: true,
      department: { select: { name: true } },
      allocations: {
        select: {
          id: true,
          staffId: true,
          proposedHundredths: true,
          staff: { select: { lastName: true } },
        },
      },
    },
  });
  // Nobody has spread this кафедра yet, so there is nothing to bring back in.
  if (!distribution || distribution.allocations.length === 0) return;

  const shareByStaff = new Map(shares.map((x) => [x.staffId, x.hundredths]));
  const limitsByStaff = new Map(
    roster.map((s) => [
      s.id,
      {
        rating: s.ratingEntries[0]?.totalScore ?? 0,
        limits: (s as { stakeLimits?: { minHundredths: number; maxHundredths: number }[] })
          .stakeLimits?.[0],
      },
    ])
  );

  const edits: {
    id: string;
    who: string;
    was: number;
    proposedHundredths: number;
    formulaHundredths: number;
  }[] = [];
  for (const allocation of distribution.allocations) {
    const share = shareByStaff.get(allocation.staffId);
    const person = limitsByStaff.get(allocation.staffId);
    // Off the roster since the split was saved — `saveDistribution` will make
    // the head refresh before it takes anything, so leave the row alone.
    if (share === undefined || !person) continue;

    // Zero rating removes the 0,10 floor, the same rule the формула and the save
    // already follow: it exists so nobody who works is unpaid, not so everybody
    // on the roster is.
    const lower =
      person.rating > 0
        ? Math.max(person.limits?.minHundredths ?? DEFAULT_LIMITS.minHundredths, MIN_STAKE)
        : 0;
    // Snapped down because a cap written before 2026-08-19 may still sit off the
    // 0,05 ladder, and a value pinned to it would be refused on the step check.
    const upper = floorToStep(
      Math.max(person.limits?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths, lower)
    );
    if (upper < lower) continue;

    const settled = Math.min(Math.max(allocation.proposedHundredths, share, lower), upper);
    if (settled === allocation.proposedHundredths) continue;
    edits.push({
      id: allocation.id,
      who: allocation.staff.lastName,
      was: allocation.proposedHundredths,
      proposedHundredths: settled,
      formulaHundredths: share,
    });
  }

  if (edits.length === 0) return;

  await db.$transaction([
    ...edits.map((edit) =>
      db.stakeAllocation.update({
        where: { id: edit.id },
        data: {
          proposedHundredths: edit.proposedHundredths,
          formulaHundredths: edit.formulaHundredths,
        },
      })
    ),
    db.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'StakeDistribution',
        entityId: distribution.id,
        label: `${distribution.department.name} — перерахунок після зміни лімітів ${year}`,
        userId,
        changes: diffChanges(
          Object.fromEntries(edits.map((e) => [e.who, e.was])),
          Object.fromEntries(edits.map((e) => [e.who, e.proposedHundredths]))
        ),
      },
    }),
  ]);
}
