'use server';

import { hash } from 'bcryptjs';
import { AuthError } from 'next-auth';
import { db } from '@/lib/db';
import { signIn } from '@/lib/auth';
import { findStaffByActivationToken } from '@/lib/activation';
import { setPasswordSchema, type SetPasswordSchema } from '@/validations/account';

export type ActivateState = { error: string } | null;

export async function activateAction(
  token: string,
  data: SetPasswordSchema
): Promise<ActivateState> {
  const parsed = setPasswordSchema.safeParse(data);
  if (!parsed.success) return { error: 'Некоректні дані' };

  const staff = await findStaffByActivationToken(token);
  if (!staff) return { error: 'Посилання недійсне або протерміноване' };

  const passwordHash = await hash(parsed.data.password, 10);

  await db.$transaction(async (tx) => {
    // tokenVersion bump: setting a new password kills any session opened with
    // the old one (matters for self-service reset of a possibly stolen account)
    await tx.staff.update({
      where: { id: staff.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.activationToken.deleteMany({ where: { staffId: staff.id } });
    await tx.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'Staff',
        entityId: staff.id,
        label: `${staff.lastName} ${staff.firstName} ${staff.patronymic}`,
        userId: staff.id,
        changes: { passwordHash: { from: null, to: '***' } },
      },
    });
  });

  // Token proved mailbox ownership and the password was just set — sign in directly
  try {
    await signIn('credentials', {
      email: staff.email,
      password: parsed.data.password,
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError)
      return { error: 'Не вдалося увійти. Спробуйте на сторінці входу' };
    throw error;
  }

  return null;
}
