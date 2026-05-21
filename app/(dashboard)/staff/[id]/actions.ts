'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { staffUpdateSchema, type StaffUpdateSchema } from '@/validations/staff';
import { diffChanges } from '@/lib/audit';
import { getEditorDivisionId, hasEntityPermission } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';

export type StaffDeleteState = { error: string } | { redirectTo: string };

export async function deleteStaff(id: string): Promise<StaffDeleteState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };

    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasEntityPermission(divisionId, 'STAFF', 'DELETE')))
      return { error: 'Недостатньо прав' };
  }

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const staff = await tx.staff.findUnique({
        where: { id },
        select: {
          lastName: true,
          firstName: true,
          patronymic: true,
          email: true,
          phone: true,
          isNpp: true,
          academicRank: true,
          scientificDegree: true,
          departmentId: true,
          divisionId: true,
        },
      });

      await tx.staff.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Staff',
          entityId: id,
          label: staff ? `${staff.lastName} ${staff.firstName} ${staff.patronymic}` : undefined,
          userId: session.user.id,
          changes: staff
            ? diffChanges(staff as Record<string, string | number | boolean | null>, {})
            : undefined,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e, 'Помилка при видаленні');
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/staff' };
}

export type StaffUpdateState = { error: string } | { success: true };

export async function updateStaff(id: string, data: StaffUpdateSchema): Promise<StaffUpdateState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';
  const isOwnProfile = role === 'USER' && session.user.staffId === id;

  if (!isAdmin && !isOwnProfile && role !== 'EDITOR') {
    return { error: 'Недостатньо прав' };
  }

  const parsed = staffUpdateSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const { partTimeDepartmentIds, ...fields } = parsed.data;

  let updateData: Record<string, unknown> = {};

  if (isAdmin) {
    updateData = { ...fields };
  } else if (role === 'EDITOR') {
    const editorStaff = await db.staff.findUnique({
      where: { id: session.user.staffId ?? '' },
      select: { divisionId: true },
    });
    if (!editorStaff?.divisionId) return { error: 'Недостатньо прав' };

    const permissions = await db.divisionFieldPermission.findMany({
      where: { divisionId: editorStaff.divisionId },
      select: { fieldName: true },
    });
    const allowed = new Set(permissions.map((p) => p.fieldName));
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.has(key)) updateData[key] = val;
    }
  } else {
    // USER editing own profile — non-confidential fields only
    const { employmentRate: _emp, ...rest } = fields;
    updateData = { ...rest };
  }

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({
        where: { id },
        select: {
          lastName: true,
          firstName: true,
          patronymic: true,
          email: true,
          phone: true,
          isNpp: true,
          employmentRate: true,
          pedagogicalExperience: true,
          academicRank: true,
          scientificDegree: true,
          degreeMatchesDepartment: true,
          wosUrl: true,
          wosCitationCount: true,
          scopusUrl: true,
          scopusCitationCount: true,
          googleScholarUrl: true,
          googleScholarCitationCount: true,
          orcidId: true,
          departmentId: true,
          divisionId: true,
        },
      });

      const beforeFiltered: Record<string, string | number | boolean | null> = {};
      for (const key of Object.keys(updateData)) {
        beforeFiltered[key] = ((existing as Record<string, unknown> | null)?.[key] ?? null) as
          | string
          | number
          | boolean
          | null;
      }
      const changes = diffChanges(
        beforeFiltered,
        updateData as Record<string, string | number | boolean | null>
      );

      await tx.staff.update({ where: { id }, data: updateData });

      if (isAdmin) {
        await tx.staffDepartment.deleteMany({ where: { staffId: id } });
        if (partTimeDepartmentIds.length > 0) {
          await tx.staffDepartment.createMany({
            data: partTimeDepartmentIds.map((deptId) => ({ staffId: id, departmentId: deptId })),
            skipDuplicates: true,
          });
        }
      }

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: id,
          label: existing
            ? `${existing.lastName} ${existing.firstName} ${existing.patronymic}`
            : undefined,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e);
  }

  if (dbError) return { error: dbError };
  return { success: true };
}
