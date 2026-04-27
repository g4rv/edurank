'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { professorSchema, type ProfessorFormValues } from './[id]/schema';

async function requireAdminOrEditor() {
  const session = await auth();
  if (!session || !['ADMIN', 'EDITOR'].includes(session.user.role))
    redirect('/');
}

export async function createProfessor(
  data: ProfessorFormValues
): Promise<{ error?: string }> {
  await requireAdminOrEditor();

  const parsed = professorSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані форми' };

  const {
    departmentId,
    lastName,
    firstName,
    patronymic,
    email,
    employmentRate,
    pedagogicalExperience,
    academicRank,
    academicPosition,
    scientificDegree,
    degreeMatchesDepartment,
    ratingSheetId,
    certificateId,
    wosURL,
    wosCitationCount,
    scopusURL,
    scopusCitationCount,
    googleScholarURL,
    googleScholarCitationCount,
    orcidId,
  } = parsed.data;

  const n = (v: string | null | undefined) => (v === '' ? null : (v ?? null));

  try {
    await prisma.professor.create({
      data: {
        lastName,
        firstName,
        patronymic: n(patronymic),
        email: n(email),
        employmentRate: employmentRate ?? null,
        pedagogicalExperience: pedagogicalExperience ?? null,
        academicRank: academicRank ?? null,
        academicPosition: academicPosition ?? null,
        scientificDegree: scientificDegree ?? null,
        degreeMatchesDepartment: degreeMatchesDepartment ?? null,
        ratingSheetId: n(ratingSheetId),
        certificateId: n(certificateId),
        wosURL: n(wosURL),
        wosCitationCount: wosCitationCount ?? null,
        scopusURL: n(scopusURL),
        scopusCitationCount: scopusCitationCount ?? null,
        googleScholarURL: n(googleScholarURL),
        googleScholarCitationCount: googleScholarCitationCount ?? null,
        orcidId: n(orcidId),
        departmentId,
      },
    });
    revalidatePath('/professors');
    return {};
  } catch {
    return { error: 'Помилка сервера' };
  }
}

export async function deleteProfessor(id: string): Promise<{ error?: string }> {
  await requireAdminOrEditor();

  try {
    await prisma.professor.delete({ where: { id } });
    revalidatePath('/professors');
    return {};
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return { error: 'Неможливо видалити — викладач має обліковий запис у системі' };
    }
    return { error: 'Помилка сервера' };
  }
}
