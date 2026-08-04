'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin, isEditorWritableField } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';

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
  // NOT divisionId — it decides an editor's own permission scope, see
  // PERMISSION_SCOPING_STAFF_FIELDS. Admin assigns divisions on the staff form.
]);

export async function setFieldPermission(
  divisionId: string,
  fieldName: string,
  enabled: boolean
): Promise<PermissionToggleState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };
  // Confidential, auth and scoping fields are not grantable, period — even if
  // the whitelist below ever drifts
  if (!isEditorWritableField(fieldName)) return { error: 'Невідоме поле' };
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
  } catch (e) {
    return { error: parseDbError(e, 'Помилка при збереженні', 'permissions.setFieldPermission') };
  }

  revalidatePath('/admin/permissions/field');
  return null;
}
