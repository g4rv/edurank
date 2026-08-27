'use server';

import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { lockedUntil, subjectsFor } from '@/lib/auth/throttle';
import { lockedMessage } from '@/lib/auth/throttle-policy';
import { loginSchema } from '@/validations/login';
import { safeCallbackPath } from '@/lib/auth/callback-url';

export type LoginState = { error: string } | null;

/**
 * Sign in, or say why not.
 *
 * The throttle is NOT enforced here — `authorize()` does that, because this
 * action is not the only way to reach the credentials provider. What happens
 * here is only the message: without it a locked-out person sees «невірний email
 * або пароль» however carefully they type, and concludes the app is broken or
 * that somebody changed their password.
 *
 * Which of the email and the password was wrong is still never disclosed. The
 * lockout is: it is a fact about the attempts this visitor has just made, not
 * about whether an account exists.
 */
export async function loginAction(
  data: { email: string; password: string },
  callbackUrl?: string | null
): Promise<LoginState> {
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірний email або пароль' };

  const subjects = await subjectsFor(parsed.data.email);

  // Checked before signing in as well as inside it, so a locked visitor is told
  // to wait rather than being sent round the whole login path for the same
  // answer — and so retrying does not extend their own lockout.
  const alreadyLocked = await lockedUntil(subjects);
  if (alreadyLocked) return { error: lockedMessage(alreadyLocked, new Date()) };

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      // Where they were headed, or `/` — which routes by role. `/staff` was
      // hardcoded here and a USER cannot open it, so every НПП signed in and
      // was bounced straight on to `/profile` (2026-08-27).
      redirectTo: safeCallbackPath(callbackUrl) ?? '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // This attempt may have been the one that tripped the lock, so the state
      // is read again rather than reusing the check above.
      const until = await lockedUntil(subjects);
      if (until) return { error: lockedMessage(until, new Date()) };
      return { error: 'Невірний email або пароль' };
    }
    throw error;
  }

  return null;
}
