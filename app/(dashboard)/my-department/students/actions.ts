'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { scopeOf } from '@/lib/queries/scope';
import { claimDecisionSchema } from '@/validations/student-claim';
import type { Role } from '@/lib/generated/prisma/client';

// The завідувач rules on the students their staff claim.
//
// **This is not arbitration.** There is no in-system winner when two people
// claim one student: the head SEES the duplicates, who was first, and how many
// of each person's claims are contested — and then they talk to that person.
// The resolution happens off-screen (decided 2026-08-07), which is why the only
// controls here are confirm and reject, one claim at a time, and why there is
// no «assign to» and no verdict field.

export type DecisionState = { error: string } | { success: true } | null;

/**
 * May this person rule on that claim?
 *
 * The claim's AUTHOR must be on a кафедра this person heads — not the student's
 * programme, which may belong to anybody. A recruiter is answerable to their own
 * завідувач wherever they sent the student.
 */
async function canDecide(
  user: { role: Role; staffId?: string | null },
  claimAuthorId: string
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const scope = await scopeOf(user.staffId);
  if (scope.length === 0) return false;

  const author = await db.staff.findUnique({
    where: { id: claimAuthorId },
    select: { departmentId: true },
  });
  return !!author?.departmentId && scope.includes(author.departmentId);
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

  if (!(await canDecide(session.user, claim.staffId))) return { error: 'Недостатньо прав' };

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
