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
import { staffStakeLimitsSchema } from '@/validations/stake';
import type { Role } from '@/lib/generated/prisma/client';

export type DistributionState = { error: string } | { success: true } | null;

/**
 * Who may spread a кафедра's pool: its завідувач, and nobody else at all.
 * Derived from `Department.headId`, never from a `Role` — one person is
 * routinely a head, an НПП and a division editor at once.
 *
 * Three exclusions, each deliberate:
 *
 * - **ADMIN** (2026-08-12) owns `Кст` and the caps but must never write a
 *   кафедра's actual split, or «завідувач розподіляє» is not true of the code.
 *   What they get instead is the sandbox below.
 * - **A декан** (2026-08-13) oversees every кафедра of their faculty and may
 *   read all of it — `scopeOf` still grants that — but retyping a split would
 *   be doing the head's job over their head. Hence `headOf`, not `scopeOf`.
 * - **EDITOR**, and never otherwise. A division editor may read any rating
 *   (W6); deciding who on a кафедра is paid what is not reading.
 */
async function canDistribute(
  user: { role: Role; staffId?: string | null },
  departmentId: string
): Promise<boolean> {
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
    return {
      error:
        session.user.role === 'ADMIN'
          ? 'Розподіл зберігає завідувач кафедри. Адміністратор може перевірити варіанти у пісочниці'
          : 'Розподіл зберігає завідувач кафедри',
    };
  }

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
    const min = Math.max(limits?.minHundredths ?? DEFAULT_LIMITS.minHundredths, MIN_STAKE);
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
export async function setStaffLimits(
  _prev: DistributionState,
  formData: FormData
): Promise<DistributionState> {
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

  if (person.departmentId) revalidateStakes(person.departmentId);
  return { success: true };
}

// ─── The sandbox ─────────────────────────────────────────────────────────────
//
// ADMIN's «що буде, якщо». Everything below writes `StakeSandbox` and nothing
// else — no `StakeAllocation`, no `StakeDistribution`, no `StaffStakeLimits`,
// no `AuditLog`. That is the guarantee the whole design rests on, so it is
// checked here rather than implied by which page called.

const sandboxLimitSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

const sandboxPayloadSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  values: z.record(z.string(), z.number().int().min(0)),
  limits: z.record(z.string(), sandboxLimitSchema),
});

type SandboxGuard = { error: string } | { userId: string };

/** ADMIN, and a кафедра that exists. Shared by all three sandbox actions. */
async function requireSandbox(departmentId: string): Promise<SandboxGuard> {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') return { error: 'Пісочниця доступна лише адміністратору' };

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) return { error: 'Кафедру не знайдено' };

  return { userId: session.user.id };
}

/**
 * ADMIN's typed numbers for one кафедра, kept so they survive a reload.
 *
 * Keyed per admin, so two people comparing two pools do not overwrite each
 * other. Written wholesale like the real grid, and for the same reason: the
 * numbers only mean anything as a set.
 */
export async function saveSandbox(payload: unknown): Promise<DistributionState> {
  const parsed = sandboxPayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані форми' };
  const { departmentId, year, values, limits } = parsed.data;

  const guard = await requireSandbox(departmentId);
  if ('error' in guard) return guard;

  for (const [, bounds] of Object.entries(limits)) {
    if (bounds.min < MIN_STAKE) {
      return { error: 'Мінімум не може бути меншим за 0,10 — ставку отримують усі' };
    }
    if (bounds.max < bounds.min) {
      return { error: 'Максимум не може бути меншим за мінімум' };
    }
  }

  try {
    await db.stakeSandbox.upsert({
      where: { userId_departmentId_year: { userId: guard.userId, departmentId, year } },
      update: { values, limits },
      create: { userId: guard.userId, departmentId, year, values, limits },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти пісочницю', 'stake.saveSandbox', {
        userId: guard.userId,
        entityId: departmentId,
      }),
    };
  }

  revalidatePath('/stakes');
  return { success: true };
}

const sandboxKstSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  /** Null puts the кафедра's real `Кст` back */
  kstHundredths: z.number().int().min(0).nullable(),
});

/**
 * The pool ADMIN is trying.
 *
 * Deliberately not validated against `0.1 × headcount` the way the real `Кст`
 * is: a sandbox exists to show what a pool that is too small would do, and
 * refusing to model it would hide the answer somebody opened the page for.
 */
export async function setSandboxKst(payload: unknown): Promise<DistributionState> {
  const parsed = sandboxKstSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Вкажіть число, напр. 6,00' };
  const { departmentId, year, kstHundredths } = parsed.data;

  const guard = await requireSandbox(departmentId);
  if ('error' in guard) return guard;

  try {
    await db.stakeSandbox.upsert({
      where: { userId_departmentId_year: { userId: guard.userId, departmentId, year } },
      update: { kstHundredths },
      create: { userId: guard.userId, departmentId, year, kstHundredths },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти пісочницю', 'stake.setSandboxKst', {
        userId: guard.userId,
        entityId: departmentId,
      }),
    };
  }

  revalidatePath('/stakes');
  return { success: true };
}

/** Throws the scratch pad away — the tab falls back to the кафедра's real numbers */
export async function resetSandbox(payload: unknown): Promise<DistributionState> {
  const parsed = z
    .object({ departmentId: z.string().min(1), year: z.number().int() })
    .safeParse(payload);
  if (!parsed.success) return { error: 'Невірні дані форми' };
  const { departmentId, year } = parsed.data;

  const guard = await requireSandbox(departmentId);
  if ('error' in guard) return guard;

  try {
    await db.stakeSandbox.deleteMany({
      where: { userId: guard.userId, departmentId, year },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося очистити пісочницю', 'stake.resetSandbox', {
        userId: guard.userId,
        entityId: departmentId,
      }),
    };
  }

  revalidatePath('/stakes');
  return { success: true };
}
