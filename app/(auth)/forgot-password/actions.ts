'use server';

import { db } from '@/lib/db';
import { issueActivationToken, ACTIVATION_TOKEN_DAYS } from '@/lib/activation';
import { sendMail } from '@/lib/mail/mailer';
import { passwordResetEmail } from '@/lib/mail/templates';
import { forgotPasswordSchema, type ForgotPasswordSchema } from '@/validations/account';

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
      activationToken: { select: { createdAt: true } },
    },
  });

  const recentlySent =
    staff?.activationToken &&
    Date.now() - staff.activationToken.createdAt.getTime() < RESEND_COOLDOWN_MS;

  if (staff && !recentlySent) {
    try {
      const token = await issueActivationToken(staff.id);
      const link = `${process.env.APP_URL ?? 'http://localhost:3000'}/activate/${token}`;
      await sendMail({
        to: staff.email,
        ...passwordResetEmail({
          fullName: `${staff.lastName} ${staff.firstName} ${staff.patronymic}`,
          link,
          expiresDays: ACTIVATION_TOKEN_DAYS,
        }),
      });
    } catch {
      // Swallow: a mailer failure must look identical to an unknown email
    }
  }

  return { success: true };
}
