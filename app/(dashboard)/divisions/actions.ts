'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { divisionSchema, type DivisionSchema } from '@/validations/division';

export type DivisionActionState = { error: string } | null;

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') return null;
  return session;
}

export async function createDivision(data: DivisionSchema): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = divisionSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.division.create({
        data: { name: parsed.data.name },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Division',
          entityId: created.id,
          label: `Створено відділ: ${parsed.data.name}`,
          userId: session.user.id,
        },
      });
    });
  } catch {
    dbError = 'Помилка при збереженні';
  }

  if (dbError) return { error: dbError };
  redirect('/divisions');
}

export async function updateDivision(
  id: string,
  data: DivisionSchema
): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = divisionSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.division.update({ where: { id }, data: { name: parsed.data.name } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Division',
          entityId: id,
          label: `Оновлено відділ: ${parsed.data.name}`,
          userId: session.user.id,
        },
      });
    });
  } catch {
    dbError = 'Помилка при збереженні';
  }

  if (dbError) return { error: dbError };
  redirect('/divisions');
}

export async function deleteDivision(id: string): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const division = await db.division.findUnique({
    where: { id },
    select: { name: true, _count: { select: { staff: true } } },
  });

  if (!division) return { error: 'Відділ не знайдено' };
  if (division._count.staff > 0)
    return { error: 'Неможливо видалити відділ, до якого прикріплений персонал' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.division.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Division',
          entityId: id,
          label: `Видалено відділ: ${division.name}`,
          userId: session.user.id,
        },
      });
    });
  } catch {
    dbError = 'Помилка при видаленні';
  }

  if (dbError) return { error: dbError };
  redirect('/divisions');
}
