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

/**
 * A token that has been generated but not yet written down.
 *
 * Minting and storing are two steps on purpose, so that the link can be built
 * and mailed BEFORE anything is saved — see `storeActivationToken`.
 */
export interface MintedToken {
  /** The raw token. Only ever known to the emailed link — never stored. */
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Generate a token and its hash. Writes nothing. */
export function mintActivationToken(hours: number): MintedToken {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  };
}

/**
 * Write a minted token down, replacing whatever the person had.
 *
 * Call this ONLY once the mail server has accepted the message. The row is the
 * app's sole record that a letter went out — /admin/invites shows its
 * `createdAt` as «Останнє запрошення» and filters a bulk send on it — so
 * storing it first counted people as written to whose mail had in fact been
 * refused, and a later «не надсилалося» send skipped them for good (owner,
 * 2026-08-25). It also threw away a link that was still working in exchange
 * for one that was never delivered.
 *
 * The remaining gap is the opposite and much smaller: if this write fails
 * after the mail is away, the person holds a link that resolves to nothing and
 * has to be invited again. Better a wasted letter than a person nobody can
 * see was missed.
 */
export async function storeActivationToken(staffId: string, minted: MintedToken): Promise<void> {
  await db.activationToken.upsert({
    where: { staffId },
    update: { tokenHash: minted.tokenHash, expiresAt: minted.expiresAt, createdAt: new Date() },
    create: { staffId, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt },
  });
}

// Resolves a raw token from an activation link to its staff row.
// Returns null for unknown or expired tokens.
export async function findStaffByActivationToken(token: string) {
  const record = await db.activationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      staff: {
        select: {
          id: true,
          email: true,
          lastName: true,
          firstName: true,
          patronymic: true,
          // Archived people are refused by `authorize` anyway, so a link that
          // still worked here only walked somebody through choosing a password
          // and then failed them at the sign-in with «Не вдалося увійти» —
          // advice to try the login page, where they fail again with nothing
          // explaining why (2026-08-27). Refused at the link instead, which is
          // the same answer an expired one gives.
          archivedAt: true,
        },
      },
    },
  });

  if (!record || record.expiresAt < new Date()) return null;
  if (record.staff.archivedAt) return null;
  return record.staff;
}
