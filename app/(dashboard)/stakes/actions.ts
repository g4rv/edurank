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
import { MIN_STAKE, STAKE_STEP, formatStake } from '@/lib/stake/units';
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
 * Everything is re-derived and re-checked here. The client computes the same
 * numbers to keep the grid live, but a client total is a hint, not a fact —
 * this is the only place the pool is actually enforced.
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

  const [department, stake, staff] = await Promise.all([
    db.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
    db.departmentStake.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { kstHundredths: true },
    }),
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true, departmentId },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        ratingEntries: { where: { year }, select: { totalScore: true } },
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

  const byId = new Map(staff.map((s) => [s.id, s]));

  // Everyone on the roster must appear, and nobody else may. A missing row is
  // somebody quietly left out of the distribution, which is the same as paying
  // them nothing — and nobody may end on zero.
  if (allocations.length !== staff.length) {
    return { error: 'Список НПП змінився. Оновіть сторінку та спробуйте ще раз' };
  }

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
        ratingEntries: { where: { year }, select: { totalScore: true } },
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

  return {
    success: true,
    formulaHundredths: formula.shares.find((x) => x.staffId === staffId)?.hundredths ?? null,
  };
}
