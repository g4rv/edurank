'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { canOverseeScience } from '@/lib/science/oversight';

/**
 * Reopen a submitted plan so its author can change it.
 *
 * **This is the other half of `lockPlan`, and it was missing.** `lockedAt` was
 * written by `lockPlan` and by nothing else, for anybody, ADMIN included —
 * while the screen told the person «План збережено … — зміни через ННВ». One
 * typo on 18 вересня froze that plan for the whole навчальний рік with no
 * remedy short of SQL (owner, 2026-09-20).
 *
 * **ННВ or ADMIN** (owner, 2026-09-20), which is exactly what the sentence on
 * screen already promised. `canOverseeScience` («Перевірка науки», D43) is
 * the same guard that decides who may decline a record. A завідувач
 * still only READS: `scopeOf` answers «may I look», `headOf` «may I decide»,
 * and this is neither of theirs to decide.
 *
 * **Not an approval step in reverse.** D4 stands: nobody signs a plan off, and
 * unlocking is a correction, not a rejection. It leaves the rows alone — the
 * author edits them — and it leaves every ScienceRecord alone, because what
 * was actually done did not stop being true when the intention reopened.
 */
export async function unlockPlan(planId: string): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canOverseeScience(session.user))) return { error: 'Недостатньо прав' };

  const plan = await db.sciencePlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      lockedAt: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
      department: { select: { name: true } },
      template: { select: { status: true } },
    },
  });

  if (!plan) return { error: 'План не знайдено' };
  // Captured, not read again inside the transaction's closure: narrowing does
  // not survive the callback boundary.
  const lockedAt = plan.lockedAt;
  if (!lockedAt) return { error: 'Цей план ще не збережено' };
  // A CLOSED навчальний рік is frozen history; the spec's «Validation and
  // anti-cheat» list refuses any write to one, and reopening a plan is a
  // write. ADMIN opens the year first if the year itself is the mistake.
  if (plan.template.status !== 'OPEN') return { error: 'Планування на цей рік закрито' };

  const label =
    `${plan.staff.lastName} ${plan.staff.firstName} ${plan.staff.patronymic ?? ''} — ${plan.department.name}`.trim();

  try {
    await db.$transaction(async (tx) => {
      // Guarded on `lockedAt: { not: null }` so two ННВ editors pressing at
      // once cannot both count as the one who reopened it.
      const reopened = await tx.sciencePlan.updateMany({
        where: { id: plan.id, lockedAt: { not: null } },
        data: { lockedAt: null },
      });
      if (reopened.count === 0) throw new AlreadyUnlockedError();

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'SciencePlan',
          entityId: plan.id,
          label,
          userId: session.user.id,
          changes: diffChanges({ lockedAt: lockedAt.toISOString() }, { lockedAt: null }),
        },
      });
    });
  } catch (e) {
    if (e instanceof AlreadyUnlockedError) return { error: 'Цей план уже відкрито' };
    return {
      error: parseDbError(
        e,
        'Не вдалося відкрити план. Зміни не застосовано',
        'science.unlockPlan',
        {
          userId: session.user.id,
        }
      ),
    };
  }

  revalidatePath('/science-plans');
  revalidatePath('/my-department/science-plans');
  revalidatePath('/science-plan');
  return { ok: true };
}

class AlreadyUnlockedError extends Error {}
