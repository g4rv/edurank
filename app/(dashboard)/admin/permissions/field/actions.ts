'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export type PermissionToggleState = { error: string } | null;

const ALLOWED_FIELD_NAMES = new Set([
  'lastName',
  'firstName',
  'patronymic',
  'email',
  'phone',
  'isNpp',
  'academicRank',
  'scientificDegree',
  'degreeMatchesDepartment',
  'pedagogicalExperience',
  'wosUrl',
  'wosCitationCount',
  'scopusUrl',
  'scopusCitationCount',
  'googleScholarUrl',
  'googleScholarCitationCount',
  'orcidId',
  'departmentId',
  'divisionId',
]);

export async function setFieldPermission(
  divisionId: string,
  fieldName: string,
  enabled: boolean
): Promise<PermissionToggleState> {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') return { error: 'Недостатньо прав' };
  if (!ALLOWED_FIELD_NAMES.has(fieldName)) return { error: 'Невідоме поле' };

  try {
    if (enabled) {
      await db.divisionFieldPermission.upsert({
        where: { divisionId_fieldName: { divisionId, fieldName } },
        create: { divisionId, fieldName },
        update: {},
      });
    } else {
      await db.divisionFieldPermission.deleteMany({ where: { divisionId, fieldName } });
    }
  } catch {
    return { error: 'Помилка при збереженні' };
  }

  revalidatePath('/admin/permissions/field');
  return null;
}
