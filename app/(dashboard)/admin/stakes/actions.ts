'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { requireAdmin } from '@/lib/permissions';
import { ON_ROSTER } from '@/lib/queries/roster';
import { formatStake, minimumKstHundredths } from '@/lib/stake/units';
import { closedYearProblem } from '@/lib/stake/writable-year';
import {
  departmentStakeSchema,
  specialityNormSchema,
  stakeYearSettingsSchema,
} from '@/validations/stake';

// The ставка settings ADMIN owns: the year's coefficient, the норматив table,
// and Кст per кафедра. All three are ADMIN-only — Кст decides how much a
// кафедра has to spread, and the caps decide what a head cannot exceed, so an
// editor writing either would undo the reason the head's own edits are bounded.

export type StakeActionState = { error: string } | { success: true } | null;

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

  if (kstHundredths < minimum) {
    return {
      error:
        `Мінімальний Кст для цієї кафедри — ${formatStake(minimum)} ` +
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
        label: `${department.name} — Кст ${year}`,
        userId: session.user.id,
        changes: diffChanges({ kstHundredths: existing?.kstHundredths ?? null }, { kstHundredths }),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти Кст. Зміни не застосовано', 'stake.setKst', {
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
