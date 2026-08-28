'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { facultySchema, type FacultySchema } from '@/validations/faculty';
import { diffChanges } from '@/lib/audit';
import { canManageEntity } from '@/lib/permissions';
import { headDeanConflict } from '@/lib/queries/scope';
import { parseDbError } from '@/lib/db-error';

export type FacultyActionState = { error: string } | { redirectTo: string };

/**
 * Nothing here used to invalidate anything, and `next.config.ts` sets
 * `experimental.staleTimes.dynamic: 30` — which puts the client Router Cache
 * back to the 30 seconds Next 15 had defaulted to 0. The forms only
 * `router.push(redirectTo)`, so a new факультет was missing from the list it
 * landed on, and a deleted one was still in it, for up to half a minute. That
 * is indistinguishable from a save that did not work (2026-08-28).
 *
 * A факультет names itself on every кафедра row and in the dashboard tree, so
 * those go too.
 */
function revalidateFaculties(id?: string) {
  revalidatePath('/faculties');
  if (id) revalidatePath(`/faculties/${id}`);
  revalidatePath('/departments');
  revalidatePath('/dashboard');
}

export async function createFaculty(data: FacultySchema): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'FACULTY', 'CREATE')))
    return { error: 'Недостатньо прав' };

  const parsed = facultySchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const conflict = await headDeanConflict(parsed.data.deanId, 'DEAN');
  if (conflict) return { error: conflict };

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
  revalidateFaculties();
  return { redirectTo: '/faculties' };
}

export async function updateFaculty(id: string, data: FacultySchema): Promise<FacultyActionState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'FACULTY', 'UPDATE')))
    return { error: 'Недостатньо прав' };

  const parsed = facultySchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const conflict = await headDeanConflict(parsed.data.deanId, 'DEAN');
  if (conflict) return { error: conflict };

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
  revalidateFaculties(id);
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
  revalidateFaculties();
  return { redirectTo: '/faculties' };
}
