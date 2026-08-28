'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { departmentSchema, type DepartmentSchema } from '@/validations/department';
import { diffChanges } from '@/lib/audit';
import { canManageEntity } from '@/lib/permissions';
import { headDeanConflict } from '@/lib/queries/scope';
import { parseDbError } from '@/lib/db-error';

export type DepartmentActionState = { error: string } | { redirectTo: string };

/**
 * See the note in `faculties/actions.ts` — same gap, same cause. A кафедра also
 * appears on its факультет's page, in the dashboard tree, and as a row on
 * `/stakes`, so a кафедра created here was absent from the ставка overview too.
 */
function revalidateDepartments(id?: string) {
  revalidatePath('/departments');
  if (id) revalidatePath(`/departments/${id}`);
  revalidatePath('/faculties');
  revalidatePath('/dashboard');
  revalidatePath('/stakes');
}

export async function createDepartment(data: DepartmentSchema): Promise<DepartmentActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'DEPARTMENT', 'CREATE')))
    return { error: 'Недостатньо прав' };

  const parsed = departmentSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const conflict = await headDeanConflict(parsed.data.headId, 'HEAD');
  if (conflict) return { error: conflict };

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
    dbError = parseDbError(
      e,
      'Не вдалося зберегти. Зміни не застосовано',
      'department.createDepartment',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  revalidateDepartments();
  return { redirectTo: '/departments' };
}

export async function updateDepartment(
  id: string,
  data: DepartmentSchema
): Promise<DepartmentActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'DEPARTMENT', 'UPDATE')))
    return { error: 'Недостатньо прав' };

  const parsed = departmentSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const conflict = await headDeanConflict(parsed.data.headId, 'HEAD');
  if (conflict) return { error: conflict };

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
    dbError = parseDbError(
      e,
      'Не вдалося зберегти. Зміни не застосовано',
      'department.updateDepartment',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  revalidateDepartments(id);
  return { redirectTo: `/departments/${id}` };
}

export async function deleteDepartment(id: string): Promise<DepartmentActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'DEPARTMENT', 'DELETE')))
    return { error: 'Недостатньо прав' };

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
    dbError = parseDbError(
      e,
      'Не вдалося видалити. Зміни не застосовано',
      'department.deleteDepartment',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  revalidateDepartments();
  return { redirectTo: '/departments' };
}
