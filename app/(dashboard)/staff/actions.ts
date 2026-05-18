'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { staffCreateSchema, type StaffCreateSchema } from '@/validations/staff';
import { diffChanges } from '@/lib/audit';

export type StaffCreateState = { error: string } | null;

export async function createStaff(data: StaffCreateSchema): Promise<StaffCreateState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };

    const editorStaff = await db.staff.findUnique({
      where: { id: session.user.staffId ?? '' },
      select: { divisionId: true },
    });
    if (!editorStaff?.divisionId) return { error: 'Недостатньо прав' };

    const permission = await db.divisionEntityPermission.findFirst({
      where: {
        divisionId: editorStaff.divisionId,
        entity: 'STAFF',
        action: 'CREATE',
      },
    });
    if (!permission) return { error: 'Недостатньо прав' };
  }

  const parsed = staffCreateSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const { partTimeDepartmentIds, departmentId, divisionId, ...rest } = parsed.data;

  const createData: Record<string, unknown> = {
    ...rest,
    departmentId: departmentId ?? null,
    divisionId: divisionId ?? null,
  };

  let createdId = '';
  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.staff.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: createData as any,
        select: { id: true },
      });
      createdId = created.id;

      if (partTimeDepartmentIds.length > 0) {
        await tx.staffDepartment.createMany({
          data: partTimeDepartmentIds.map((deptId) => ({
            staffId: created.id,
            departmentId: deptId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Staff',
          entityId: created.id,
          label: `Створено запис Staff: ${rest.lastName} ${rest.firstName}`,
          userId: session.user.id,
          changes: diffChanges({}, createData as Record<string, string | number | boolean | null>),
        },
      });
    });
  } catch {
    dbError = 'Помилка при збереженні';
  }

  if (dbError) return { error: dbError };
  redirect(`/staff/${createdId}`);
}
