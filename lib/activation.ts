import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';

/**
 * How long an emailed link stays usable. Two numbers, not one.
 *
 * An INVITATION waits on paperwork and on somebody who has not started yet, so
 * thirty days is the answer that saves an admin re-inviting half the intake.
 *
 * A RESET is the opposite: a key to a live account, lying in a mailbox. And
 * `resetPassword` clears the password hash before sending, so for the whole
 * window the link IS the account — anyone who reaches that mailbox owns the
 * record, an ADMIN's included. A month of that was the invitation's number
 * inherited by a case it never fitted.
 */
export const INVITE_TOKEN_HOURS = 30 * 24;
export const RESET_TOKEN_HOURS = 2;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Creates (or replaces) the staff member's activation token.
// Returns the raw token — it is only ever known to the emailed link.
export async function issueActivationToken(staffId: string, hours: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  await db.activationToken.upsert({
    where: { staffId },
    update: { tokenHash: hashToken(token), expiresAt, createdAt: new Date() },
    create: { staffId, tokenHash: hashToken(token), expiresAt },
  });

  return token;
}

// Resolves a raw token from an activation link to its staff row.
// Returns null for unknown or expired tokens.
export async function findStaffByActivationToken(token: string) {
  const record = await db.activationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      staff: {
        select: { id: true, email: true, lastName: true, firstName: true, patronymic: true },
      },
    },
  });

  if (!record || record.expiresAt < new Date()) return null;
  return record.staff;
}
