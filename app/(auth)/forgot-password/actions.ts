'use server';

import { db } from '@/lib/db';
import { issueAndEmailLink } from '@/lib/mail/invite';
import { forgotPasswordSchema, type ForgotPasswordSchema } from '@/validations/account';
import { logError } from '@/lib/log';

export type ForgotPasswordState = { error: string } | { success: true };

// Cooldown so a stranger typing someone's email can't flood their mailbox
const RESEND_COOLDOWN_MS = 60 * 1000;

// Public self-service reset. Always answers success for a well-formed email —
// whether an account exists must not be observable. The current password
// keeps working until the emailed link is used (only the admin reset
// deactivates the account).
export async function requestPasswordReset(
  data: ForgotPasswordSchema
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse(data);
  if (!parsed.success) return { error: 'Некоректний email' };

  const staff = await db.staff.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      // Decides WHICH letter goes out — see below. Never leaves this function.
      passwordHash: true,
      activationToken: { select: { createdAt: true } },
    },
  });

  const recentlySent =
    staff?.activationToken &&
    Date.now() - staff.activationToken.createdAt.getTime() < RESEND_COOLDOWN_MS;

  if (staff && !recentlySent) {
    // An account with no password has never been activated, and there is one
    // very ordinary way to arrive here: a new colleague cannot find the
    // invitation and tries «Забули пароль?». Sending «Скидання паролю» to
    // somebody who has never had one is wrong twice — it names a password that
    // does not exist, and it ends «зверніться до адміністратора», which is
    // precisely the detour the link in their hands already saves them.
    //
    // A token is still issued either way. It replaces whatever invitation was
    // outstanding, and it has to: the raw token is never stored, only its hash,
    // so the original link cannot be sent again. The person gets a working link
    // under the heading that matches their situation.
    const kind = staff.passwordHash ? 'reset' : 'invite';
    try {
      await issueAndEmailLink(staff, kind);
    } catch (e) {
      // The CALLER still learns nothing — the answer must look identical whether
      // or not the address exists. But it is logged: if SMTP is down, every
      // reset silently fails and this is the only place that would show it.
      logError('auth.requestPasswordReset', e, { entityId: staff.id });
    }
  }

  return { success: true };
}
