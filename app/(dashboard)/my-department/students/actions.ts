'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { claimDecisionSchema } from '@/validations/student-claim';
import type { Role } from '@/lib/generated/prisma/client';

// ADMIN rules on the students staff claim.
//
// **This is not arbitration.** There is no in-system winner when two people
// claim one student: the screen SHOWS the duplicates, who was first, and how
// many of each person's claims are contested — and then somebody talks to those
// people. The resolution happens off-screen (decided 2026-08-07), which is why
// the only controls here are confirm and reject, one claim at a time, and why
// there is no «assign to» and no verdict field.

export type DecisionState = { error: string } | { success: true } | null;

/**
 * May this person rule on that claim? **ADMIN, and nobody else** (owner,
 * 2026-08-25).
 *
 * This retracts the rule of 2026-08-17, «admin/head can approve (dean can only
 * inspect)». A завідувач could confirm their own кафедра's claims, and a claim
 * pays a bonus out of a fund the same завідувач then spends — the person who
 * benefits from a confirmation should not be the person making it. A декан was
 * already refused; now a head is too.
 *
 * Headship therefore plays no part here any more, and `headOf` is not consulted
 * at all. A head still READS the queue — see the page, which keeps them at
 * `canDecide: false` exactly as it has always kept a декан.
 */
function canDecide(user: { role: Role }): boolean {
  return user.role === 'ADMIN';
}

export async function decideStudentClaim(
  _prev: DecisionState,
  formData: FormData
): Promise<DecisionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const decision = formData.get('decision');
  const parsed = claimDecisionSchema.safeParse(
    decision === 'REJECTED'
      ? { claimId: formData.get('claimId'), decision, reason: formData.get('reason') }
      : { claimId: formData.get('claimId'), decision }
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };

  const claim = await db.studentClaim.findUnique({
    where: { id: parsed.data.claimId },
    select: {
      staffId: true,
      status: true,
      studentName: true,
      staff: { select: { lastName: true, firstName: true } },
    },
  });
  if (!claim) return { error: 'Запис не знайдено' };

  if (!canDecide(session.user)) return { error: 'Недостатньо прав' };

  // Narrowed on the discriminant itself: a boolean derived from it does not
  // carry the narrowing, and `reason` only exists on the rejecting branch.
  const decided =
    parsed.data.decision === 'CONFIRMED'
      ? { status: 'CONFIRMED' as const, rejectReason: null }
      : // The НПП sees this, the same way they see a discarded rating entry
        { status: 'REJECTED' as const, rejectReason: parsed.data.reason };
  const confirming = decided.status === 'CONFIRMED';

  try {
    await db.studentClaim.update({
      where: { id: parsed.data.claimId },
      data: {
        ...decided,
        confirmedById: session.user.id,
        confirmedAt: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'StudentClaim',
        entityId: parsed.data.claimId,
        label: `${claim.staff.lastName} ${claim.staff.firstName} — здобувач ${claim.studentName}`,
        userId: session.user.id,
        changes: diffChanges(
          { status: claim.status },
          { status: confirming ? 'CONFIRMED' : 'REJECTED' }
        ),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося зберегти рішення. Зміни не застосовано', 'claims.decide', {
        userId: session.user.id,
        entityId: parsed.data.claimId,
      }),
    };
  }

  revalidatePath('/my-department/students');
  revalidatePath('/achievements/students');
  // A confirmation changes the bonus column on the distribution grid
  revalidatePath('/departments', 'layout');
  return { success: true };
}
