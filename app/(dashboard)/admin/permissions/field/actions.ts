'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin, AUTH_STAFF_FIELDS, CONFIDENTIAL_STAFF_FIELDS } from '@/lib/permissions';

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
  'adminPosition',
  'basicEducationMatch',
  'basicEducationSpecialty',
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
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  // Confidential and auth fields are not grantable, period — even if the whitelist drifts
  if (CONFIDENTIAL_STAFF_FIELDS.has(fieldName)) return { error: 'Невідоме поле' };
  if (AUTH_STAFF_FIELDS.has(fieldName)) return { error: 'Невідоме поле' };
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
