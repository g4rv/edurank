'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { facultySchema, type FacultySchema } from '@/validations/faculty';
import { diffChanges } from '@/lib/audit';

export type FacultyActionState = { error: string } | null;

async function getEditorDivisionId(staffId: string | null | undefined): Promise<string | null> {
  if (!staffId) return null;
  const s = await db.staff.findUnique({ where: { id: staffId }, select: { divisionId: true } });
  return s?.divisionId ?? null;
}

async function hasFacultyPermission(
  divisionId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE'
): Promise<boolean> {
  const perm = await db.divisionEntityPermission.findFirst({
    where: { divisionId, entity: 'FACULTY', action },
  });
  return !!perm;
}

export async function createFaculty(data: FacultySchema): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasFacultyPermission(divisionId, 'CREATE')))
      return { error: 'Недостатньо прав' };
  }

  const parsed = facultySchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.faculty.create({
        data: { name: parsed.data.name, deanId: parsed.data.deanId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Faculty',
          entityId: created.id,
          label: `Створено факультет: ${parsed.data.name}`,
          userId: session.user.id,
          changes: diffChanges({}, { name: parsed.data.name, deanId: parsed.data.deanId ?? null }),
        },
      });
    });
  } catch {
    dbError = 'Помилка при збереженні';
  }

  if (dbError) return { error: dbError };
  redirect('/faculties');
}

export async function updateFaculty(id: string, data: FacultySchema): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasFacultyPermission(divisionId, 'UPDATE')))
      return { error: 'Недостатньо прав' };
  }

  const parsed = facultySchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.faculty.findUnique({
        where: { id },
        select: { name: true, deanId: true },
      });
      const changes = diffChanges(
        { name: existing?.name ?? null, deanId: existing?.deanId ?? null },
        { name: parsed.data.name, deanId: parsed.data.deanId ?? null }
      );

      await tx.faculty.update({
        where: { id },
        data: { name: parsed.data.name, deanId: parsed.data.deanId },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Faculty',
          entityId: id,
          label: `Оновлено факультет: ${parsed.data.name}`,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch {
    dbError = 'Помилка при збереженні';
  }

  if (dbError) return { error: dbError };
  redirect('/faculties');
}

export async function deleteFaculty(id: string): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') return { error: 'Недостатньо прав' };
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId || !(await hasFacultyPermission(divisionId, 'DELETE')))
      return { error: 'Недостатньо прав' };
  }

  const faculty = await db.faculty.findUnique({
    where: { id },
    select: { name: true, deanId: true, _count: { select: { departments: true } } },
  });

  if (!faculty) return { error: 'Факультет не знайдено' };
  if (faculty._count.departments > 0)
    return { error: 'Неможливо видалити факультет, що має кафедри' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.faculty.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Faculty',
          entityId: id,
          label: `Видалено факультет: ${faculty.name}`,
          userId: session.user.id,
          changes: diffChanges({ name: faculty.name, deanId: faculty.deanId ?? null }, {}),
        },
      });
    });
  } catch {
    dbError = 'Помилка при видаленні';
  }

  if (dbError) return { error: dbError };
  redirect('/faculties');
}
