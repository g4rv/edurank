import { db } from '@/lib/db';
import {
  buildKharakterystyka,
  type Kharakterystyka,
  type KharakterystykaActivity,
} from '@/lib/kharakterystyka/build';
import { windowFor } from '@/lib/kharakterystyka/positions';

/**
 * One person's Характеристика over the five years ending at `lastYear`.
 *
 * Reads across years on purpose — unlike the rating, which is per year, п.38
 * asks «за останні 5 років». Closed years are included and are exactly the point:
 * a person's licence positions are built from their whole recent record, not
 * from whatever the open year happens to hold.
 *
 * Statuses are NOT filtered here. `buildKharakterystyka` applies the same rule
 * the score uses (APPROVED rows of an active indicator), and encoding it twice
 * is how the two would drift apart.
 */
export async function getKharakterystyka(
  staffId: string,
  lastYear: number
): Promise<Kharakterystyka | null> {
  const { from, to } = windowFor(lastYear);

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, scientificDegree: true, degreeDefenceDate: true },
  });
  // Non-НПП have no rating and therefore no Характеристика — the document is
  // about academic activity, and an empty one for an accountant is misleading
  // rather than merely empty.
  if (!staff?.isNpp) return null;

  const activities = await db.activity.findMany({
    where: { staffId, year: { gte: from, lte: to } },
    select: {
      year: true,
      status: true,
      evidence: true,
      activityType: {
        select: {
          itemNumber: true,
          label: true,
          isActive: true,
          licencePositions: true,
          evidenceFields: true,
        },
      },
    },
  });

  return buildKharakterystyka(activities as KharakterystykaActivity[], staff, lastYear);
}
