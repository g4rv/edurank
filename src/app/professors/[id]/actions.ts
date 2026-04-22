'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getEditableFields, canEdit } from '@/lib/field-access';
import { professorSchema, type ProfessorFormValues } from './schema';
import { revalidatePath } from 'next/cache';

export type UpdateProfessorResult =
  | { success: true }
  | { success: false; error: string };

export async function updateProfessor(
  professorId: string,
  data: ProfessorFormValues
): Promise<UpdateProfessorResult> {
  const session = await auth();
  if (!session) return { success: false, error: 'Не авторизовано' };

  const parsed = professorSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: 'Невірні дані форми' };

  const values = parsed.data;

  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { division: true },
  });

  const editableFields = getEditableFields(
    session.user.role,
    sessionUser?.division?.name
  );

  const dbData: Record<string, unknown> = {};

  if (canEdit('lastName', editableFields) && values.lastName)
    dbData.lastName = values.lastName;
  if (canEdit('firstName', editableFields) && values.firstName)
    dbData.firstName = values.firstName;
  if (canEdit('patronymic', editableFields))
    dbData.patronymic = values.patronymic || null;
  if (canEdit('email', editableFields)) dbData.email = values.email || null;
  if (canEdit('employmentRate', editableFields))
    dbData.employmentRate = values.employmentRate ?? null;
  if (canEdit('pedagogicalExperience', editableFields))
    dbData.pedagogicalExperience = values.pedagogicalExperience ?? null;
  if (canEdit('academicRank', editableFields))
    dbData.academicRank = values.academicRank ?? null;
  if (canEdit('academicPosition', editableFields))
    dbData.academicPosition = values.academicPosition ?? null;
  if (canEdit('scientificDegree', editableFields))
    dbData.scientificDegree = values.scientificDegree ?? null;
  if (canEdit('degreeMatchesDepartment', editableFields))
    dbData.degreeMatchesDepartment = values.degreeMatchesDepartment ?? null;
  if (canEdit('ratingSheetId', editableFields))
    dbData.ratingSheetId = values.ratingSheetId || null;
  if (canEdit('certificateId', editableFields))
    dbData.certificateId = values.certificateId || null;
  if (canEdit('wosURL', editableFields)) dbData.wosURL = values.wosURL || null;
  if (canEdit('wosCitationCount', editableFields))
    dbData.wosCitationCount = values.wosCitationCount ?? 0;
  if (canEdit('scopusURL', editableFields))
    dbData.scopusURL = values.scopusURL || null;
  if (canEdit('scopusCitationCount', editableFields))
    dbData.scopusCitationCount = values.scopusCitationCount ?? 0;
  if (canEdit('googleScholarURL', editableFields))
    dbData.googleScholarURL = values.googleScholarURL || null;
  if (canEdit('googleScholarCitationCount', editableFields))
    dbData.googleScholarCitationCount = values.googleScholarCitationCount ?? 0;
  if (canEdit('orcidId', editableFields))
    dbData.orcidId = values.orcidId || null;

  if (Object.keys(dbData).length === 0)
    return { success: false, error: 'Немає полів для оновлення' };

  try {
    await prisma.professor.update({ where: { id: professorId }, data: dbData });
  } catch {
    return { success: false, error: 'Помилка при збереженні' };
  }

  revalidatePath(`/professors/${professorId}`);
  return { success: true };
}
