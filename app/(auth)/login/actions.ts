'use server';

import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { loginSchema } from '@/validations/login';

export type LoginState = { error: string } | null;

export async function loginAction(data: { email: string; password: string }): Promise<LoginState> {
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірний email або пароль' };

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/staff',
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: 'Невірний email або пароль' };
    throw error;
  }

  return null;
}
