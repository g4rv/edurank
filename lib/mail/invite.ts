import { issueActivationToken, ACTIVATION_TOKEN_DAYS } from '@/lib/activation';
import { sendMail } from '@/lib/mail/mailer';
import { inviteEmail, passwordResetEmail } from '@/lib/mail/templates';

/**
 * Issue an activation token and mail the link.
 *
 * Lived inside `staff/[id]/actions.ts` while one button was the only caller.
 * Three now need it — that button, creating a person with «надіслати
 * запрошення» ticked, and the bulk invite — and a token that is minted in one
 * place and mailed in another is exactly the kind of thing that drifts.
 *
 * Throws on an SMTP failure. Every caller must decide for itself what that
 * means: for a single button it is the whole outcome, for a create it must not
 * lose the person, and for a batch it must not stop the remaining people.
 */

export interface InviteRecipient {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  patronymic: string;
}

export function staffFullName(s: {
  lastName: string;
  firstName: string;
  patronymic: string;
}): string {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

export async function issueAndEmailLink(
  staff: InviteRecipient,
  kind: 'invite' | 'reset'
): Promise<void> {
  const token = await issueActivationToken(staff.id);
  const link = `${process.env.APP_URL ?? 'http://localhost:3000'}/activate/${token}`;
  const input = {
    fullName: staffFullName(staff),
    link,
    expiresDays: ACTIVATION_TOKEN_DAYS,
  };
  await sendMail({
    to: staff.email,
    ...(kind === 'invite' ? inviteEmail(input) : passwordResetEmail(input)),
  });
}
