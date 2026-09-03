'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { getStakeYearSettings } from '@/lib/queries/list-stake-settings';
import { logError } from '@/lib/log';
import { claimValue, normaliseStudentName } from '@/lib/stake/claims';
import { parseTemplate, planImport } from '@/lib/students/import';
import { readSheet, SheetError } from '@/lib/students/import-sheet';
import { admittedStudentSchema } from '@/validations/admitted-student';

// Реєстр зарахованих — ADMIN only, checked in every action and not merely on
// the page. The register is deliberately not offered to divisions, so there is
// no entity permission to consult here (owner, 2026-09-03).

export type AdmittedActionState = { error: string } | { success: true };

async function adminSession() {
  const session = await auth();
  if (!session) redirect('/login');
  return session.user.role === 'ADMIN' ? session : null;
}

function revalidateRegister() {
  revalidatePath('/admin/students');
  revalidatePath('/achievements/students');
  revalidatePath('/my-department/students');
}

export async function addAdmittedStudent(input: unknown): Promise<AdmittedActionState> {
  const session = await adminSession();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = admittedStudentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };

  const { name, specialityId, degree, form, funding, year } = parsed.data;

  const speciality = await db.speciality.findUnique({
    where: { id: specialityId },
    select: { name: true },
  });
  if (!speciality) return { error: 'Спеціальність не знайдено' };

  try {
    const student = await db.admittedStudent.create({
      data: {
        year,
        name,
        nameNormalised: normaliseStudentName(name),
        specialityId,
        degree,
        form,
        funding,
      },
      select: { id: true },
    });

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'AdmittedStudent',
        entityId: student.id,
        label: `${name} — ${speciality.name} (${year})`,
        userId: session.user.id,
        changes: diffChanges({}, { name, specialityId, degree, form, funding, year }),
      },
    });
  } catch (e) {
    // The unique key is (рік, ПІБ, спеціальність, форма, фінансування), so this
    // is a student already in the register on these exact terms — not a defect.
    if (isUniqueViolation(e)) {
      return { error: 'Цей здобувач уже є в реєстрі на цих умовах' };
    }
    return {
      error: parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'students.add', {
        userId: session.user.id,
      }),
    };
  }

  revalidateRegister();
  return { success: true };
}

/** One НПП who claimed this student, and what deleting them costs */
export interface Claimant {
  staffName: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  /** In ставки. Zero for anything not CONFIRMED — `claimValue` says so. */
  loses: number;
}

/**
 * The student and every claim that names them.
 *
 * Claims are found by the NORMALISED ПІБ. Both sides are written by
 * `normaliseStudentName`, which is the whole reason AdmittedStudent carries
 * that column: match on the typed name instead and «О’лена» with U+2019 and
 * «О'лена» with an apostrophe are two people, so the warning below finds
 * nothing and the admin deletes a claim they were never shown.
 */
async function studentWithClaims(id: string) {
  const student = await db.admittedStudent.findUnique({
    where: { id },
    select: {
      id: true,
      year: true,
      name: true,
      nameNormalised: true,
      specialityId: true,
      degree: true,
      form: true,
      funding: true,
      speciality: { select: { name: true, norms: { select: { base: true, year: true } } } },
    },
  });
  if (!student) return null;

  const claims = await db.studentClaim.findMany({
    where: {
      year: student.year,
      studentNameNormalised: student.nameNormalised,
      specialityId: student.specialityId,
    },
    select: {
      id: true,
      status: true,
      degree: true,
      form: true,
      funding: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return { student, claims };
}

/**
 * Who claimed this student, and what each of them loses. Step one of two.
 *
 * The dialog quotes real ставки, so the figures come from `claimValue` — the
 * same function the bonus itself is paid on — rather than from a second rule
 * that could drift away from it.
 */
export async function claimantsFor(
  id: string
): Promise<{ error: string } | { claimants: Claimant[] }> {
  const session = await adminSession();
  if (!session) return { error: 'Недостатньо прав' };

  const found = await studentWithClaims(id);
  if (!found) return { error: 'Здобувача не знайдено' };

  const { student, claims } = found;
  const settings = await getStakeYearSettings(student.year);
  const base = student.speciality.norms.find((n) => n.year === student.year)?.base ?? null;

  return {
    claimants: claims.map((claim) => ({
      staffName: `${claim.staff.lastName} ${claim.staff.firstName} ${claim.staff.patronymic}`,
      status: claim.status,
      loses: claimValue(
        {
          staffId: '',
          status: claim.status,
          degree: claim.degree,
          form: claim.form,
          funding: claim.funding,
          base,
        },
        settings.contractCoefficient
      ),
    })),
  };
}

/**
 * Remove a student, and the claims that name them.
 *
 * **The claims go too** (owner, 2026-09-03). A claim points at no register row —
 * it stores the ПІБ as text and a Speciality id — so deleting the student alone
 * would leave the claim paying a bonus for somebody who is on no list, with
 * nothing on any screen ever saying so. Cascading is what makes the warning the
 * admin confirms a true sentence.
 *
 * One audit entry, not one per claim: one admin action is one line, and who
 * lost what belongs in that line's `changes` — it is the fact somebody will
 * later have to explain to an НПП whose bonus moved.
 */
export async function deleteAdmittedStudent(id: string): Promise<AdmittedActionState> {
  const session = await adminSession();
  if (!session) return { error: 'Недостатньо прав' };

  const found = await studentWithClaims(id);
  if (!found) return { error: 'Здобувача не знайдено' };

  const { student, claims } = found;

  try {
    await db.$transaction(async (tx) => {
      await tx.studentClaim.deleteMany({
        where: {
          year: student.year,
          studentNameNormalised: student.nameNormalised,
          specialityId: student.specialityId,
        },
      });
      await tx.admittedStudent.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'AdmittedStudent',
          entityId: id,
          label: `${student.name} — ${student.speciality.name} (${student.year})`,
          userId: session.user.id,
          changes: diffChanges(
            {
              name: student.name,
              specialityId: student.specialityId,
              degree: student.degree,
              form: student.form,
              funding: student.funding,
              year: student.year,
              claims:
                claims
                  .map((c) => `${c.staff.lastName} ${c.staff.firstName} (${c.status})`)
                  .join(', ') || '—',
            },
            {}
          ),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(e, 'Не вдалося видалити. Зміни не застосовано', 'students.delete', {
        userId: session.user.id,
      }),
    };
  }

  revalidateRegister();
  return { success: true };
}

/** What one import run would do, or did */
export interface ImportReport {
  added: number;
  skipped: number;
  /** Ukrainian sentences. Non-empty means NOTHING was written. */
  problems: string[];
  /** True when the rows were actually saved */
  applied: boolean;
  /** The year's total after the run — only meaningful when `applied` */
  total: number;
}

/**
 * Import a наказ from the деканат's spreadsheet.
 *
 * **One action, an `apply` flag — the same shape as `pnpm db:import-students`.**
 * Without it the file is parsed and counted and nothing is written; with it the
 * file is parsed again and the missing rows are saved. The browser still holds
 * the File, so confirming re-sends it: no half-finished import parked on the
 * server, and no trusting rows the client could have edited between the two
 * steps. Everything is re-resolved on the way in either way.
 *
 * **A file with any unreadable row is refused whole.** The alternative is a
 * register quietly missing the students nobody can then claim — the rule
 * scripts/build-accepted-students.ts has followed since it was written.
 *
 * The рік comes from the dialog, not the sheet: one наказ is one campaign, the
 * person importing it knows which, and a column is one more thing to get wrong.
 */
export async function importAdmittedStudents(formData: FormData): Promise<ImportReport> {
  const refuse = (problem: string): ImportReport => ({
    added: 0,
    skipped: 0,
    problems: [problem],
    applied: false,
    total: 0,
  });

  const session = await adminSession();
  if (!session) return refuse('Недостатньо прав');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return refuse('Оберіть файл');

  const year = Number(formData.get('year'));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return refuse('Невірний рік');

  const apply = formData.get('apply') === '1';

  let cells: string[][];
  try {
    cells = await readSheet(await file.arrayBuffer());
  } catch (e) {
    if (e instanceof SheetError) return refuse(e.message);
    logError('students.import', e, { userId: session.user.id });
    return refuse('Не вдалося прочитати файл');
  }

  const parsed = parseTemplate(cells);
  if (parsed.problems.length > 0) {
    return { added: 0, skipped: 0, problems: parsed.problems, applied: false, total: 0 };
  }

  const [specialities, existingRows] = await Promise.all([
    db.speciality.findMany({ select: { id: true, name: true } }),
    db.admittedStudent.findMany({
      where: { year },
      select: {
        nameNormalised: true,
        form: true,
        funding: true,
        speciality: { select: { name: true } },
      },
    }),
  ]);

  const specialityIds = new Map(specialities.map((s) => [s.name, s.id]));
  // Built the way importKey builds it, but from rows that are already
  // normalised — so the ПІБ must NOT be put through the normaliser twice.
  const existing = new Set(
    existingRows.map((r) =>
      [year, r.nameNormalised, r.speciality.name, r.form, r.funding].join('|')
    )
  );

  const plan = planImport(year, parsed.rows, specialityIds, existing);

  if (plan.problems.length > 0) {
    return { added: 0, skipped: 0, problems: plan.problems, applied: false, total: 0 };
  }

  if (!apply) {
    return {
      added: plan.create.length,
      skipped: plan.skipped.length,
      problems: [],
      applied: false,
      total: 0,
    };
  }

  try {
    if (plan.create.length > 0) await db.admittedStudent.createMany({ data: plan.create });

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'AdmittedStudent',
        // No single row to point at — the entry is about the RUN. The audit
        // page falls back to `label` when it cannot resolve an id, which is
        // exactly what should happen here.
        entityId: `import-${year}`,
        label: `Імпорт реєстру за ${year}: ${plan.create.length} додано`,
        userId: session.user.id,
        changes: diffChanges(
          {},
          { year, added: plan.create.length, skipped: plan.skipped.length, file: file.name }
        ),
      },
    });
  } catch (e) {
    return refuse(
      parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'students.import', {
        userId: session.user.id,
      })
    );
  }

  const total = await db.admittedStudent.count({ where: { year } });
  revalidateRegister();

  return {
    added: plan.create.length,
    skipped: plan.skipped.length,
    problems: [],
    applied: true,
    total,
  };
}
