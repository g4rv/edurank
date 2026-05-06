'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { staffUpdateSchema, type StaffUpdateSchema } from '@/validations/staff';

export type StaffUpdateState = { error: string } | null;

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
          label: `Оновлено запис Staff`,
          userId: session.user.id,
        },
      });
    });
  } catch {
    dbError = 'Помилка при збереженні';
  }

  if (dbError) return { error: dbError };
  redirect(`/staff/${id}`);
}
