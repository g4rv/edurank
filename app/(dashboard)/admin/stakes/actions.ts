'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { requireAdmin } from '@/lib/permissions';
import { ON_ROSTER } from '@/lib/queries/roster';
import { formatStake, minimumKstHundredths } from '@/lib/stake/units';
import { closedYearProblem } from '@/lib/stake/writable-year';
import { ADMIN_POSITION_LABELS } from '@/lib/labels';
import {
  bonusPoolSchema,
  departmentStakeSchema,
  statusBonusSchema,
  specialityNormSchema,
  stakeYearSettingsSchema,
} from '@/validations/stake';

// The ставка settings ADMIN owns: the year's coefficient, the норматив table,
// and Кст per кафедра. All three are ADMIN-only — Кст decides how much a
// кафедра has to spread, and the caps decide what a head cannot exceed, so an
// editor writing either would undo the reason the head's own edits are bounded.

export type StakeActionState = { error: string } | { success: true } | null;

/**
 * `setStatusBonus` hands back what it STORED, not what it was sent.
 *
 * The value is snapped to the 0,05 ladder on the way in, so 0,04 becomes 0,05 —
 * and the field showed «0,04» afterwards, because its draft was seeded once and
 * never followed the row. The number on screen was the one nobody had saved
 * (owner, 2026-08-18). Returning it is cheaper than making the client re-derive
 * a rounding rule the server owns.
 */
export type StatusBonusState =
  | { error: string }
  | { success: true; valueHundredths: number }
  | null;

function revalidateStakes() {
  revalidatePath('/stakes');
  revalidatePath('/admin/stakes/norms');
  revalidatePath('/departments');
  revalidatePath('/my-department');
}

/**
 * `Кст` for one кафедра.
 *
 * The floor is enforced here rather than in the Zod schema because it needs the
 * roster count, and the message has to carry the arithmetic: «мінімум 1,80 (18
 * осіб × 0,1)» tells somebody whether to raise the pool or check the roster,
 * where a bare «занадто мало» tells them neither.
 */
export async function setDepartmentStake(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = departmentStakeSchema.safeParse({
    departmentId: formData.get('departmentId'),
    year: Number(formData.get('year')),
    kstHundredths: formData.get('kst'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  }
  const { departmentId, year, kstHundredths } = parsed.data;

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { name: true },
  });
  if (!department) return { error: 'Кафедру не знайдено' };

  // Every НПП on the кафедра, not Кнпп: the pool must be able to pay the floor
  // to everybody, including staff who do not meet the licence positions.
  const headcount = await db.staff.count({
    where: { ...ON_ROSTER, isNpp: true, departmentId },
  });
  const minimum = minimumKstHundredths(headcount);

  // Zero is not an allocation (2026-08-17). It used to be accepted for a кафедра
  // with nobody on it, where the floor computes to 0,00 — but «виділено 0,00»
  // and «ще не виділено» then looked identical on screen while meaning quite
  // different things. Leaving the field empty is how you say «not yet».
  if (kstHundredths <= 0) {
    return { error: 'Фонд не може бути нульовим. Залиште поле порожнім, якщо ще не виділено' };
  }

  if (kstHundredths < minimum) {
    return {
      error:
        `Мінімальний основний фонд для цієї кафедри — ${formatStake(minimum)} ` +
        `(${headcount} осіб × 0,10). Менше виділити не можна — не всім вистачить на мінімальну ставку.`,
    };
  }

  try {
    const existing = await db.departmentStake.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { id: true, kstHundredths: true },
    });

    const row = await db.departmentStake.upsert({
      where: { departmentId_year: { departmentId, year } },
      update: { kstHundredths },
      create: { departmentId, year, kstHundredths },
    });

    await db.auditLog.create({
      data: {
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'DepartmentStake',
        entityId: row.id,
        label: `${department.name} — основний фонд ${year}`,
        userId: session.user.id,
        changes: diffChanges({ kstHundredths: existing?.kstHundredths ?? null }, { kstHundredths }),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти фонд. Зміни не застосовано', 'stake.setKst', {
        userId: session.user.id,
        entityId: departmentId,
      }),
    };
  }

  revalidateStakes();
  return { success: true };
}

/** One speciality's норматив for the year — бакалавр/денна; the rest derives */
export async function setSpecialityNorm(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = specialityNormSchema.safeParse({
    specialityId: formData.get('specialityId'),
    year: Number(formData.get('year')),
    base: formData.get('base'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  }
  const { specialityId, year, base } = parsed.data;

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  const speciality = await db.speciality.findUnique({
    where: { id: specialityId },
    select: { name: true },
  });
  if (!speciality) return { error: 'Спеціальність не знайдено' };

  try {
    const existing = await db.specialityNorm.findUnique({
      where: { specialityId_year: { specialityId, year } },
      select: { base: true },
    });

    const row = await db.specialityNorm.upsert({
      where: { specialityId_year: { specialityId, year } },
      update: { base },
      create: { specialityId, year, base },
    });

    await db.auditLog.create({
      data: {
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'SpecialityNorm',
        entityId: row.id,
        label: `${speciality.name} — норматив ${year}`,
        userId: session.user.id,
        changes: diffChanges({ base: existing?.base ?? null }, { base }),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти норматив. Зміни не застосовано',
        'stake.setNorm',
        { userId: session.user.id, entityId: specialityId }
      ),
    };
  }

  revalidateStakes();
  return { success: true };
}

/** The узгоджуючий коефіцієнт for контракт students */
export async function setStakeYearSettings(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = stakeYearSettingsSchema.safeParse({
    year: Number(formData.get('year')),
    contractCoefficient: formData.get('contractCoefficient'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  }
  const { year, contractCoefficient } = parsed.data;

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  try {
    const existing = await db.stakeYearSettings.findUnique({
      where: { year },
      select: { contractCoefficient: true },
    });

    await db.stakeYearSettings.upsert({
      where: { year },
      update: { contractCoefficient },
      create: { year, contractCoefficient },
    });

    await db.auditLog.create({
      data: {
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'StakeYearSettings',
        entityId: String(year),
        label: `Узгоджуючий коефіцієнт ${year}`,
        userId: session.user.id,
        changes: diffChanges(
          { contractCoefficient: existing?.contractCoefficient ?? null },
          { contractCoefficient }
        ),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти налаштування. Зміни не застосовано',
        'stake.setYearSettings',
        { userId: session.user.id }
      ),
    };
  }

  revalidateStakes();
  return { success: true };
}

/**
 * The bonus pool — a кафедра's second allocation, spread by hand months later.
 *
 * Deliberately a separate action and a separate column from `Кст`. The formula
 * reads `Кст` and only `Кст`, so a pool it cannot see is a pool it cannot
 * redistribute: the first distribution is protected by the shape of the data
 * rather than by a lock somebody has to remember to set (2026-08-17).
 *
 * No floor here. `Кст` must pay everyone the minimum; this one is a top-up for
 * the people who earned it, and zero is a legitimate answer for a кафедра whose
 * staff recruited nobody.
 */
export async function setBonusPool(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = bonusPoolSchema.safeParse({
    departmentId: formData.get('departmentId'),
    year: Number(formData.get('year')),
    bonusPoolHundredths: formData.get('bonusPool'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  const { departmentId, year, bonusPoolHundredths } = parsed.data;

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  const existing = await db.departmentStake.findUnique({
    where: { departmentId_year: { departmentId, year } },
    select: { id: true, bonusPoolHundredths: true },
  });
  // Without `Кст` there is no distribution to top up, and a bonus pool alone
  // would sit on a кафедра nobody has funded.
  if (!existing) {
    return { error: 'Спочатку встановіть основний фонд для цієї кафедри' };
  }

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { name: true },
  });

  try {
    await db.departmentStake.update({
      where: { departmentId_year: { departmentId, year } },
      data: { bonusPoolHundredths },
    });

    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'DepartmentStake',
        entityId: existing.id,
        label: `${department?.name ?? departmentId} — бонусний фонд ${year}`,
        userId: session.user.id,
        changes: diffChanges(
          { bonusPoolHundredths: existing.bonusPoolHundredths },
          { bonusPoolHundredths }
        ),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти бонусний фонд. Зміни не застосовано',
        'stake.setBonusPool',
        { userId: session.user.id, entityId: departmentId }
      ),
    };
  }

  revalidateStakes();
  return { success: true };
}

/**
 * What one administrative position is worth, for the whole university.
 *
 * Set once per year and applied automatically from `Staff.adminPosition` —
 * nobody ticks a box. The position is already on every profile and already
 * drives the Характеристика; asking somebody to restate it here would be asking
 * them to re-enter a fact the app holds.
 *
 * **This changes no ставка.** It moves «Рекомендовано», which is a figure the
 * завідувач compares against and may ignore.
 */
export async function setStatusBonus(
  _prev: StatusBonusState,
  formData: FormData
): Promise<StatusBonusState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = statusBonusSchema.safeParse({
    year: Number(formData.get('year')),
    position: formData.get('position'),
    valueHundredths: formData.get('value'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
  const { year, position, valueHundredths } = parsed.data;

  const closed = await closedYearProblem(year);
  if (closed) return { error: closed };

  try {
    const existing = await db.stakeStatusBonus.findUnique({
      where: { year_position: { year, position } },
      select: { valueHundredths: true },
    });

    const row = await db.stakeStatusBonus.upsert({
      where: { year_position: { year, position } },
      update: { valueHundredths },
      create: { year, position, valueHundredths },
    });

    await db.auditLog.create({
      data: {
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'StakeStatusBonus',
        entityId: row.id,
        label: `${ADMIN_POSITION_LABELS[position]} — надбавка ${year}`,
        userId: session.user.id,
        changes: diffChanges(
          { valueHundredths: existing?.valueHundredths ?? null },
          { valueHundredths }
        ),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти надбавку. Зміни не застосовано',
        'stake.setStatusBonus',
        { userId: session.user.id }
      ),
    };
  }

  revalidateStakes();
  return { success: true, valueHundredths };
}

/**
 * Which кафедра graduates one спеціальність — `SpecialityDepartment`.
 *
 * Display only: `lib/specialities/origin.ts` reads this pair to colour the
 * bonus chips (`components/stake/bonus-cell.tsx`, rendered from
 * `components/stake/distribution-grid.tsx` on /stakes/[id]) and decides
 * nothing about a ставка, a bonus or a claim. This is what makes the 2026
 * reorganisation survivable without a developer — every other link in the
 * app used to be a name match against a hardcoded constant.
 */
export async function linkSpecialityDepartment(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const specialityId = String(formData.get('specialityId') ?? '');
  const departmentId = String(formData.get('departmentId') ?? '');
  if (!specialityId || !departmentId) return { error: 'Невірні дані' };

  const [speciality, department] = await Promise.all([
    db.speciality.findUnique({ where: { id: specialityId }, select: { name: true } }),
    db.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
  ]);
  if (!speciality || !department) return { error: 'Запис не знайдено' };

  try {
    await db.specialityDepartment.create({ data: { specialityId, departmentId } });
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'SpecialityDepartment',
        entityId: `${specialityId}:${departmentId}`,
        label: `${speciality.name} → ${department.name}`,
        userId: session.user.id,
        changes: diffChanges({}, { department: department.name }),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'stakes.linkSpeciality', {
        userId: session.user.id,
        entityId: specialityId,
      }),
    };
  }

  revalidateStakes();
  return { success: true };
}

/** The mirror of `linkSpecialityDepartment` — removes one кафедра from one спеціальність */
export async function unlinkSpecialityDepartment(
  _prev: StakeActionState,
  formData: FormData
): Promise<StakeActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const specialityId = String(formData.get('specialityId') ?? '');
  const departmentId = String(formData.get('departmentId') ?? '');
  if (!specialityId || !departmentId) return { error: 'Невірні дані' };

  const [speciality, department] = await Promise.all([
    db.speciality.findUnique({ where: { id: specialityId }, select: { name: true } }),
    db.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
  ]);
  if (!speciality || !department) return { error: 'Запис не знайдено' };

  try {
    await db.specialityDepartment.delete({
      where: { specialityId_departmentId: { specialityId, departmentId } },
    });
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entity: 'SpecialityDepartment',
        entityId: `${specialityId}:${departmentId}`,
        label: `${speciality.name} → ${department.name}`,
        userId: session.user.id,
        changes: diffChanges({ department: department.name }, {}),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'stakes.unlinkSpeciality',
        {
          userId: session.user.id,
          entityId: specialityId,
        }
      ),
    };
  }

  revalidateStakes();
  return { success: true };
}
