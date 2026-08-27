'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { normaliseStudentName } from '@/lib/stake/claims';
import {
  findAcceptedStudent,
  studentsMatching,
  type RegisterCriteria,
} from '@/lib/students/accepted';
import { studentClaimSchema } from '@/validations/student-claim';

// «Мої залучені здобувачі» — an НПП records the students they brought in.
//
// **Adding is silent.** Nothing here checks whether somebody else has already
// claimed the same student, and nothing warns the person if they have. The
// duplicate is the evidence and it belongs to the завідувач, not to the two
// people competing over it — blocking or warning would hand the ставка to
// whoever typed first rather than to whoever did the work.
//
// **Every field is taken from the register, none from the form.** The form
// sends five values, all of them chosen from pickers; this file uses them only
// to FIND the one admitted student they describe, and then saves that student's
// speciality, form, funding and рівень. A picker constrains a person, not a
// request — and a claim whose speciality disagrees with the наказ is a ставка
// computed off the wrong норматив.

/**
 * `token` is a fresh id on every successful add. The form keys its fields on it
 * to clear them, which is how the fields reset without an effect that calls
 * setState — React refuses to memoise a component that does that, and a
 * cascading render on every save is a real cost for a cosmetic reset.
 */
/**
 * Nothing is handed back on failure any more.
 *
 * There is no free text left in the form: every field is a choice held in React
 * state, which survives a rejected submit on its own. The `studentName` that
 * used to travel back was the typed ПІБ, and there is no longer such a thing.
 */
export type ClaimState = { error: string } | { success: true; token: string } | null;

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

  const failed = (error: string): ClaimState => ({ error });

  const staffId = session.user.staffId;
  if (!staffId) return failed('Профіль не знайдено');

  const parsed = studentClaimSchema.safeParse({
    studentName: formData.get('studentName'),
    speciality: formData.get('speciality'),
    form: formData.get('form'),
    funding: formData.get('funding'),
  });
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? 'Невірні дані');

  // The register decides what is saved. Everything below comes from `student`,
  // never from `parsed.data` — the two agree when the form was used normally,
  // and when they do not it is a request nobody made through the UI.
  const { studentName, ...criteria } = parsed.data;
  const student = findAcceptedStudent(studentName, criteria);
  if (!student) return failed('Такого здобувача немає у списку зарахованих на обраних умовах');

  const year = await activeYear();
  if (!year) return failed('Рейтинговий рік закрито або ще не налаштовано');

  const [staff, speciality] = await Promise.all([
    db.staff.findUnique({
      where: { id: staffId },
      select: { isNpp: true, archivedAt: true, lastName: true, firstName: true },
    }),
    db.speciality.findUnique({ where: { name: student.speciality }, select: { id: true } }),
  ]);
  if (!staff?.isNpp) return failed('Залучення здобувачів обліковується лише для НПП');
  if (staff.archivedAt) return failed('Запис архівовано');
  // Only reachable for a speciality the register has and додаток 5 does not, so
  // the seed never created a row for it. Says who can fix it, rather than
  // failing as «щось пішло не так».
  if (!speciality) {
    return failed(`Спеціальності «${student.speciality}» ще немає в системі — зверніться до ННВ`);
  }

  try {
    const claim = await db.studentClaim.create({
      data: {
        staffId,
        year,
        studentName: student.name,
        studentNameNormalised: normaliseStudentName(student.name),
        specialityId: speciality.id,
        degree: student.degree,
        form: student.form,
        funding: student.funding,
      },
      select: { id: true },
    });

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'StudentClaim',
        entityId: claim.id,
        label: `${staff.lastName} ${staff.firstName} — здобувач ${student.name}`,
        userId: session.user.id,
        changes: diffChanges({}, { studentName: student.name }),
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
 * The admitted students behind one combination, for the last step of the picker.
 *
 * Fetched rather than shipped: the register is ~130 KB and a кафедра's worth of
 * a page's audience would download all 722 names to choose one. A combination
 * is at most a few dozen.
 *
 * Signed-in staff only. These are real people's names and the page they feed is
 * already НПП-only; there is nothing here for an anonymous request.
 */
export async function listStudentCandidates(criteria: RegisterCriteria): Promise<string[]> {
  const session = await auth();
  if (!session) redirect('/login');

  return studentsMatching(criteria).map((student) => student.name);
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
    // Not the завідувач (2026-08-27). Only ADMIN rules on a claim since
    // 2026-08-25 — `canDecide` is `isAdmin` alone and a head's own page is
    // read-only — so the old wording sent people to somebody with no button.
    return { error: 'Запис уже розглянуто — зверніться до адміністратора' };
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
