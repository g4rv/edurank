'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { departmentSchema, type DepartmentSchema } from '@/validations/department';
import { diffChanges } from '@/lib/audit';
import { getEditorDivisionId, hasEntityPermission } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';

export type DepartmentActionState = { error: string } | { redirectTo: string };

export async function createDepartment(data: DepartmentSchema): Promise<DepartmentActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasEntityPermission(divisionId, 'DEPARTMENT', 'CREATE')))
      return { error: 'Недостатньо прав' };
  }

  const parsed = departmentSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.department.create({
        data: {
          name: parsed.data.name,
          facultyId: parsed.data.facultyId,
          headId: parsed.data.headId,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Department',
          entityId: created.id,
          label: parsed.data.name,
          userId: session.user.id,
          changes: diffChanges(
            {},
            {
              name: parsed.data.name,
              facultyId: parsed.data.facultyId,
              headId: parsed.data.headId ?? null,
            }
          ),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e);
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/departments' };
}

export async function updateDepartment(
  id: string,
  data: DepartmentSchema
): Promise<DepartmentActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasEntityPermission(divisionId, 'DEPARTMENT', 'UPDATE')))
      return { error: 'Недостатньо прав' };
  }

  const parsed = departmentSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.department.findUnique({
        where: { id },
        select: { name: true, facultyId: true, headId: true },
      });
      const changes = diffChanges(
        {
          name: existing?.name ?? null,
          facultyId: existing?.facultyId ?? null,
          headId: existing?.headId ?? null,
        },
        {
          name: parsed.data.name,
          facultyId: parsed.data.facultyId,
          headId: parsed.data.headId ?? null,
        }
      );

      await tx.department.update({
        where: { id },
        data: {
          name: parsed.data.name,
          facultyId: parsed.data.facultyId,
          headId: parsed.data.headId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Department',
          entityId: id,
          label: parsed.data.name,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e);
  }

  if (dbError) return { error: dbError };
  return { redirectTo: `/departments/${id}` };
}

export async function deleteDepartment(id: string): Promise<DepartmentActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasEntityPermission(divisionId, 'DEPARTMENT', 'DELETE')))
      return { error: 'Недостатньо прав' };
  }

  const department = await db.department.findUnique({
    where: { id },
    select: {
      name: true,
      facultyId: true,
      headId: true,
      _count: { select: { primaryStaff: true, partTimeStaff: true } },
    },
  });

  if (!department) return { error: 'Кафедру не знайдено' };
  if (department._count.primaryStaff > 0 || department._count.partTimeStaff > 0)
    return { error: 'Неможливо видалити кафедру, до якої прикріплений персонал' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.department.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Department',
          entityId: id,
          label: department.name,
          userId: session.user.id,
          changes: diffChanges(
            {
              name: department.name,
              facultyId: department.facultyId,
              headId: department.headId ?? null,
            },
            {}
          ),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e, 'Помилка при видаленні');
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/departments' };
}
