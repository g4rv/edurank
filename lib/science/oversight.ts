import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * Who oversees наукова робота: ADMIN, or an EDITOR whose division carries
 * `canOverseeScience` — «Перевірка науки» on the division form (D43, owner
 * 2026-09-23).
 *
 * This used to be ННВ by `registryKey`, deliberately NOT a grantable flag, on
 * the reading that наказ №152 п.3 names ННВ. The owner reversed it: the right
 * is now a switch on `/divisions/[id]/edit`, and the migration that added it
 * turned it on for ННВ, so nobody lost access on deploy.
 *
 * Shape mirrors `canModerateRating` (`lib/rating/moderation.ts`) on purpose —
 * two division rights, read the same way. They stay separate flags: rating
 * moderation and science oversight may be given to different divisions.
 *
 * Callers: the dashboard nav, `/science-plans`, `/moderation`'s science
 * section, `fileUrl`, `unlockPlan` — every one enforces it server-side again.
 */
export async function canOverseeScience(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR' || !user.staffId) return false;

  const staff = await db.staff.findUnique({
    where: { id: user.staffId },
    select: { division: { select: { canOverseeScience: true } } },
  });
  return staff?.division?.canOverseeScience === true;
}
