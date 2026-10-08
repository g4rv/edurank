import { db } from '@/lib/db';
import { emailMatches } from '@/lib/auth/email';

/** What a person is told, beside the email field, when the address is held already */
export const EMAIL_TAKEN_MESSAGE = 'Працівник з таким email вже існує';

/**
 * Does another person already hold this address, in any case?
 *
 * `Staff.email` is `@unique`, but Postgres compares text case-sensitively, so the
 * constraint lets `Vasyl@…` in beside `vasyl@…` (production, 2026-10-08). This is
 * the check the database cannot make. Archived people count: their row still holds
 * the address, and so does the sign-in and the reset mail that look it up.
 *
 * `exceptId` is the person being edited — their own row is not a duplicate of itself.
 */
export async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const other = await db.staff.findFirst({
    where: { ...emailMatches(email), ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return other !== null && other !== undefined;
}
