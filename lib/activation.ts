import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';

export const ACTIVATION_TOKEN_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Creates (or replaces) the staff member's activation token.
// Returns the raw token — it is only ever known to the emailed link.
export async function issueActivationToken(staffId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_DAYS * 24 * 60 * 60 * 1000);

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

export async function consumeActivationToken(staffId: string): Promise<void> {
  await db.activationToken.deleteMany({ where: { staffId } });
}
