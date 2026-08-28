'use server';

import { db } from '@/lib/db';
import { issueAndEmailLink } from '@/lib/mail/invite';
import { forgotPasswordSchema, type ForgotPasswordSchema } from '@/validations/account';
import { emailMatches } from '@/lib/auth/email';
import { logError, logWarning } from '@/lib/log';

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

  // Case-insensitive, for the same reason `authorize` is: an address stored
  // with a capital would otherwise be unreachable here too, so the one person
  // who most needs a reset link could not ask for one.
  const [staff, ...ambiguous] = await db.staff.findMany({
    where: emailMatches(parsed.data.email),
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
    take: 2,
  });

  // Two rows differing only in case: sending to one of them at random could
  // hand the wrong person a link to an account that is not theirs.
  if (ambiguous.length > 0) {
    logWarning('auth.requestPasswordReset', 'two accounts differ only by email case', {
      email: parsed.data.email,
    });
    return { success: true };
  }

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
