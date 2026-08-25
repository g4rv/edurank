import {
  INVITE_TOKEN_HOURS,
  RESET_TOKEN_HOURS,
  mintActivationToken,
  storeActivationToken,
} from '@/lib/activation';
import { sendMail } from '@/lib/mail/mailer';
import { inviteEmail, passwordResetEmail } from '@/lib/mail/templates';
import { validityPhrase } from '@/lib/mail/validity';

/** An invitation may wait a month; a key to a live account may not. */
const LIFETIME_HOURS = { invite: INVITE_TOKEN_HOURS, reset: RESET_TOKEN_HOURS } as const;

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
 *
 * Nothing is written until the message is away. The token row is the app's
 * only record that a letter went out, so minting it first turned every refused
 * message into a person the invite list believed had been written to.
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
  const hours = LIFETIME_HOURS[kind];
  const minted = mintActivationToken(hours);
  const link = `${process.env.APP_URL ?? 'http://localhost:3000'}/activate/${minted.token}`;
  const input = {
    fullName: staffFullName(staff),
    link,
    validFor: validityPhrase(hours),
  };
  await sendMail({
    to: staff.email,
    ...(kind === 'invite' ? inviteEmail(input) : passwordResetEmail(input)),
  });
  // Only now. A refused message must leave no trace saying it went out, and
  // must not revoke a link the person may still be holding.
  await storeActivationToken(staff.id, minted);
}
