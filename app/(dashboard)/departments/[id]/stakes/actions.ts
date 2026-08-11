'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { ON_ROSTER } from '@/lib/queries/roster';
import { scopeOf } from '@/lib/queries/scope';
import { DEFAULT_LIMITS, formulaShares } from '@/lib/stake/formula';
import { MIN_STAKE, STAKE_STEP, formatStake } from '@/lib/stake/units';
import { staffStakeLimitsSchema } from '@/validations/stake';
import type { Role } from '@/lib/generated/prisma/client';

export type DistributionState = { error: string } | { success: true } | null;

/**
 * Who may spread a кафедра's pool: its завідувач, the декан of its факультет,
 * and ADMIN. Derived from `Department.headId` / `Faculty.deanId`, never from a
 * `Role` — one person is routinely a head, an НПП and a division editor at once.
 *
 * EDITOR is deliberately NOT here. A division editor may read any rating (W6),
 * but deciding who on a кафедра is paid what is the head's job.
 */
async function canDistribute(
  user: { role: Role; staffId?: string | null },
  departmentId: string
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  return (await scopeOf(user.staffId)).includes(departmentId);
}

const allocationSchema = z.object({
  staffId: z.string().min(1),
  hundredths: z.number().int().min(0),
  justification: z.string().trim().max(2000).nullable(),
});

const savePayloadSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  allocations: z.array(allocationSchema).min(1),
});

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
    return { error: 'Недостатньо прав' };
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

  let total = 0;
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

    total += allocation.hundredths;
  }

  // THE hard block. `Кст` bounds the pool share and nothing else — the
  // recruitment bonus is paid on top and is not part of this sum. With no
  // approval step behind it, the save is the only place left to enforce it.
  if (total > stake.kstHundredths) {
    return {
      error:
        `Розподілено ${formatStake(total)} із ${formatStake(stake.kstHundredths)}. ` +
        `Перевищення на ${formatStake(total - stake.kstHundredths)} — зменште чиюсь ставку.`,
    };
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

  // Обґрунтування is OPTIONAL. Додаток 2 has the column and the положення says
  // the head justifies a deviation, but nobody has established that the app
  // must refuse a save without one — so it does not. A head who wants to write
  // nothing writes nothing, and the empty cell is what reaches додаток 2.
  //
  // If that is ever tightened, tighten it here and in `blockedBy` on the grid
  // together: refusing on the server while the client saves cheerfully is the
  // worst of both.

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
          justification: a.justification,
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

  revalidatePath(`/departments/${departmentId}/stakes`);
  revalidatePath('/admin/stakes');
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
        { userId: session.user.id, entityId: staffId }
      ),
    };
  }

  if (person.departmentId) revalidatePath(`/departments/${person.departmentId}/stakes`);
  return { success: true };
}
