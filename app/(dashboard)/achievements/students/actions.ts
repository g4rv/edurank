'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { normaliseStudentName } from '@/lib/stake/claims';
import { studentClaimSchema } from '@/validations/student-claim';

// «Мої залучені здобувачі» — an НПП records the students they brought in.
//
// **Adding is silent.** Nothing here checks whether somebody else has already
// claimed the same student, and nothing warns the person if they have. The
// duplicate is the evidence and it belongs to the завідувач, not to the two
// people competing over it — blocking or warning would hand the ставка to
// whoever typed first rather than to whoever did the work.

/**
 * `token` is a fresh id on every successful add. The form keys its fields on it
 * to clear them, which is how the fields reset without an effect that calls
 * setState — React refuses to memoise a component that does that, and a
 * cascading render on every save is a real cost for a cosmetic reset.
 */
/**
 * `studentName` comes back on failure so the form can put it back.
 *
 * React 19 resets an uncontrolled form once its action resolves, so a rejected
 * submit wipes every plain input — here, the one field nobody wants to retype.
 * The three pickers hold their own React state and survive on their own; only
 * this one needs handing back.
 */
export type ClaimState =
  | { error: string; studentName?: string }
  | { success: true; token: string }
  | null;

function revalidateClaims() {
  revalidatePath('/achievements/students');
  revalidatePath('/my-department/students');
}

/** The year claims are filed against — always the active template's, never client input */
async function activeYear(): Promise<number | null> {
  const template = await getActiveTemplate();
  return template && template.status === 'OPEN' ? template.year : null;
}

export async function addStudentClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const session = await auth();
  if (!session) redirect('/login');

  // Whatever they typed, handed back with every failure below
  const typed = String(formData.get('studentName') ?? '');
  const failed = (error: string): ClaimState => ({ error, studentName: typed });

  const staffId = session.user.staffId;
  if (!staffId) return failed('Профіль не знайдено');

  const parsed = studentClaimSchema.safeParse({
    studentName: formData.get('studentName'),
    specialityId: formData.get('specialityId'),
    degree: formData.get('degree'),
    form: formData.get('form'),
    funding: formData.get('funding'),
  });
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? 'Невірні дані');

  const year = await activeYear();
  if (!year) return failed('Рейтинговий рік закрито або ще не налаштовано');

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, archivedAt: true, lastName: true, firstName: true },
  });
  if (!staff?.isNpp) return failed('Залучення здобувачів обліковується лише для НПП');
  if (staff.archivedAt) return failed('Запис архівовано');

  try {
    const claim = await db.studentClaim.create({
      data: {
        staffId,
        year,
        studentName: parsed.data.studentName,
        studentNameNormalised: normaliseStudentName(parsed.data.studentName),
        specialityId: parsed.data.specialityId,
        degree: parsed.data.degree,
        form: parsed.data.form,
        funding: parsed.data.funding,
      },
      select: { id: true },
    });

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'StudentClaim',
        entityId: claim.id,
        label: `${staff.lastName} ${staff.firstName} — здобувач ${parsed.data.studentName}`,
        userId: session.user.id,
        changes: diffChanges({}, { studentName: parsed.data.studentName }),
      },
    });
  } catch (e) {
    // The unique key is (staffId, year, name, speciality) — so this is the same
    // person adding the same student twice, their own slip. Somebody ELSE
    // claiming the same student is not a violation and never reaches here.
    if (isUniqueViolation(e)) {
      return failed('Ви вже додали цього здобувача на цю спеціальність');
    }
    return failed(
      parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'claims.add', {
        userId: session.user.id,
      })
    );
  }

  revalidateClaims();
  return { success: true, token: crypto.randomUUID() };
}

/**
 * An НПП removes their own claim — only while it is still PENDING.
 *
 * Once the head has confirmed it, the bonus is part of a distribution somebody
 * has worked on, and withdrawing it silently would move a number on a screen
 * they are not looking at. A confirmed claim that turns out to be wrong is the
 * head's to reject, not the author's to delete.
 */
export async function deleteStudentClaim(claimId: string): Promise<ClaimState> {
  const session = await auth();
  if (!session) redirect('/login');

  const claim = await db.studentClaim.findUnique({
    where: { id: claimId },
    select: { staffId: true, status: true, studentName: true },
  });
  if (!claim) return { error: 'Запис не знайдено' };
  if (claim.staffId !== session.user.staffId) return { error: 'Недостатньо прав' };
  if (claim.status !== 'PENDING') {
    return { error: 'Запис уже розглянуто — зверніться до завідувача кафедри' };
  }

  try {
    await db.studentClaim.delete({ where: { id: claimId } });
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entity: 'StudentClaim',
        entityId: claimId,
        label: `Здобувач ${claim.studentName}`,
        userId: session.user.id,
        changes: diffChanges({ studentName: claim.studentName }, {}),
      },
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося видалити. Зміни не застосовано', 'claims.delete', {
        userId: session.user.id,
        entityId: claimId,
      }),
    };
  }

  revalidateClaims();
  return { success: true, token: crypto.randomUUID() };
}
