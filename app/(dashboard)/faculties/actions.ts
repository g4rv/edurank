'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { facultySchema, type FacultySchema } from '@/validations/faculty';
import { diffChanges } from '@/lib/audit';
import { canManageEntity } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';

export type FacultyActionState = { error: string } | { redirectTo: string };

export async function createFaculty(data: FacultySchema): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'FACULTY', 'CREATE')))
    return { error: 'Недостатньо прав' };

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
          label: parsed.data.name,
          userId: session.user.id,
          changes: diffChanges({}, { name: parsed.data.name, deanId: parsed.data.deanId ?? null }),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(
      e,
      'Не вдалося зберегти. Зміни не застосовано',
      'faculty.createFaculty',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/faculties' };
}

export async function updateFaculty(id: string, data: FacultySchema): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'FACULTY', 'UPDATE')))
    return { error: 'Недостатньо прав' };

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
      'faculty.updateFaculty',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  return { redirectTo: `/faculties/${id}` };
}

export async function deleteFaculty(id: string): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'FACULTY', 'DELETE')))
    return { error: 'Недостатньо прав' };

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
          label: faculty.name,
          userId: session.user.id,
          changes: diffChanges({ name: faculty.name, deanId: faculty.deanId ?? null }, {}),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(
      e,
      'Не вдалося видалити. Зміни не застосовано',
      'faculty.deleteFaculty',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/faculties' };
}
