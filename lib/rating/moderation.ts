import { db } from '@/lib/db';
import { RATING_DIVISIONS } from '@/lib/rating/activity-types';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * Who may discard NPP self-reports: ADMIN, or an EDITOR whose division is ННВ
 * (plan decision — NPP_SUBMISSION types carry no per-type verifying division).
 */
export async function canModerateRating(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR' || !user.staffId) return false;

  const staff = await db.staff.findUnique({
    where: { id: user.staffId },
    select: { division: { select: { name: true } } },
  });
  return staff?.division?.name === RATING_DIVISIONS.NNV;
}
