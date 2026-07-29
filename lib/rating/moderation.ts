import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';

/** Publication submissions that get the manual «Перевірено» check (M9.1) */
export const PUBLICATION_CODES: ReadonlySet<string> = new Set([
  'publication_cat_a',
  'publication_cat_b',
]);

/**
 * Who may discard NPP self-reports: ADMIN, or an EDITOR whose division carries
 * the moderation flag (NPP_SUBMISSION types have no per-type verifying division,
 * so the right sits on the division itself).
 *
 * The flag replaces a match on the division's name: «ННВ» is a label an admin
 * can edit on /divisions, and renaming it used to revoke moderation from every
 * one of its editors without a word — the nav item simply disappeared. The seed
 * sets it for ННВ; any other division can be granted it in the division form.
 */
export async function canModerateRating(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR' || !user.staffId) return false;

  const staff = await db.staff.findUnique({
    where: { id: user.staffId },
    select: { division: { select: { canModerateRating: true } } },
  });
  return staff?.division?.canModerateRating === true;
}
