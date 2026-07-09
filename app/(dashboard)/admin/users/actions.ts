'use server';

import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { userFormSchema, type UserFormSchema } from '@/validations/user';
import { diffChanges } from '@/lib/audit';
import { requireAdmin } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';

export type UserActionState = { error: string } | { redirectTo: string };

export async function createUser(data: UserFormSchema): Promise<UserActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = userFormSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  if (!parsed.data.password) return { error: "Пароль є обов'язковим" };

  const passwordHash = await hash(parsed.data.password, 10);
  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash,
          role: parsed.data.role,
          staffId: parsed.data.staffId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'User',
          entityId: user.id,
          label: parsed.data.email,
          userId: session.user.id,
          changes: diffChanges(
            {},
            {
              email: parsed.data.email,
              role: parsed.data.role,
              staffId: parsed.data.staffId ?? null,
            }
          ),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e);
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/admin/users' };
}

export async function updateUser(id: string, data: UserFormSchema): Promise<UserActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = userFormSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const updateData: Record<string, unknown> = {
    email: parsed.data.email,
    role: parsed.data.role,
    staffId: parsed.data.staffId ?? null,
    tokenVersion: { increment: 1 },
  };

  if (parsed.data.password) {
    updateData.passwordHash = await hash(parsed.data.password, 10);
  }

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id },
        select: { email: true, role: true, staffId: true },
      });
      const changesData: Record<string, string | null> = {
        email: parsed.data.email,
        role: parsed.data.role,
        staffId: parsed.data.staffId ?? null,
      };
      const changes = diffChanges(
        {
          email: existing?.email ?? null,
          role: existing?.role ?? null,
          staffId: existing?.staffId ?? null,
        },
        changesData
      );
      if (parsed.data.password) {
        (changes as Record<string, unknown>).password = { from: '***', to: '***' };
      }

      await tx.user.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'User',
          entityId: id,
          label: parsed.data.email,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e);
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/admin/users' };
}

export async function deleteUser(id: string): Promise<UserActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (session.user.id === id) return { error: 'Неможливо видалити власний обліковий запис' };

  const user = await db.user.findUnique({
    where: { id },
    select: { email: true, role: true, staffId: true },
  });
  if (!user) return { error: 'Користувача не знайдено' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'User',
          entityId: id,
          label: user.email,
          userId: session.user.id,
          changes: diffChanges({ email: user.email, role: user.role, staffId: user.staffId }, {}),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e, 'Помилка при видаленні');
  }

  if (dbError) return { error: dbError };
  return { redirectTo: '/admin/users' };
}

export type ForceLogoutState = { error: string } | { success: true };

export async function forceLogoutUser(id: string): Promise<ForceLogoutState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  try {
    await db.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  } catch (e) {
    return { error: parseDbError(e, 'Помилка') };
  }

  return { success: true };
}
