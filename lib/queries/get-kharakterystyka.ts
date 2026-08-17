import { db } from '@/lib/db';
import {
  buildKharakterystyka,
  type Kharakterystyka,
  type KharakterystykaActivity,
} from '@/lib/kharakterystyka/build';
import { windowFor } from '@/lib/kharakterystyka/positions';

/**
 * Statuses are NOT filtered in these queries. `buildKharakterystyka` applies the
 * same rule the score uses (APPROVED rows of an active indicator), and encoding
 * it twice is how the two would drift apart.
 *
 * Both functions read ACROSS years on purpose — unlike the rating, which is per
 * year, п.38 asks «за останні 5 років». Closed years are included and are
 * exactly the point: a person's licence positions come from their whole recent
 * record, not from whatever the open year happens to hold.
 */
const ACTIVITY_SELECT = {
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
} as const;

/** One person's Характеристика over the five years ending at `lastYear`. */
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
  // about academic activity, and an empty one for an accountant asserts
  // something false rather than merely being empty.
  if (!staff?.isNpp) return null;

  const activities = await db.activity.findMany({
    where: { staffId, year: { gte: from, lte: to } },
    select: ACTIVITY_SELECT,
  });

  return buildKharakterystyka(activities as KharakterystykaActivity[], staff, lastYear);
}

/**
 * The same document for many people at once — TWO queries for the whole set
 * rather than two per person.
 *
 * The bulk export needs this: at ~300 НПП the per-person path is ~600 round
 * trips, which is the difference between a download and a timeout. Returns a
 * map keyed by staff id; anyone who is not an НПП is simply absent, matching
 * `getKharakterystyka` returning null for them.
 */
export async function getKharakterystykaMany(
  staffIds: readonly string[],
  lastYear: number
): Promise<Map<string, Kharakterystyka>> {
  const result = new Map<string, Kharakterystyka>();
  if (staffIds.length === 0) return result;

  const { from, to } = windowFor(lastYear);

  const [staff, activities] = await Promise.all([
    db.staff.findMany({
      where: { id: { in: [...staffIds] }, isNpp: true },
      select: { id: true, scientificDegree: true, degreeDefenceDate: true },
    }),
    db.activity.findMany({
      where: { staffId: { in: [...staffIds] }, year: { gte: from, lte: to } },
      select: { staffId: true, ...ACTIVITY_SELECT },
    }),
  ]);

  const byStaff = new Map<string, KharakterystykaActivity[]>();
  for (const a of activities) {
    const list = byStaff.get(a.staffId);
    if (list) list.push(a as KharakterystykaActivity);
    else byStaff.set(a.staffId, [a as KharakterystykaActivity]);
  }

  // Iterate the staff rows, not the activity map: somebody with nothing at all
  // still gets a document — twenty empty positions is the honest answer and the
  // starting state for most people.
  for (const s of staff) {
    result.set(s.id, buildKharakterystyka(byStaff.get(s.id) ?? [], s, lastYear));
  }

  return result;
}

/**
 * Which indicators feed each п.38 position — «звідки береться це значення».
 *
 * Every derived position said nothing about its own source, so a person looking
 * at «0 з 5» had no way of knowing what would count towards it (owner asked,
 * 2026-08-17). The evidence column answers it once you HAVE entries; before
 * that it is a dash, which is exactly when the question is asked.
 *
 * Read from the template rather than from this person's activities: the whole
 * point is to name indicators they have nothing under yet. `licencePositions`
 * is a column, so a mapping an admin changes shows up here without a deploy.
 *
 * Deactivated indicators are left out — one that scores nothing cannot satisfy
 * anything either, and offering it as a route would be a wrong instruction.
 */
export async function licencePositionSources(
  year: number
): Promise<Map<number, { itemNumber: string; label: string }[]>> {
  const types = await db.activityType.findMany({
    where: { isActive: true, template: { year } },
    select: { itemNumber: true, label: true, licencePositions: true },
    orderBy: { order: 'asc' },
  });

  const byPosition = new Map<number, { itemNumber: string; label: string }[]>();
  for (const type of types) {
    const links = Array.isArray(type.licencePositions) ? type.licencePositions : [];
    for (const link of links) {
      const position = (link as { position?: unknown })?.position;
      if (typeof position !== 'number') continue;
      const list = byPosition.get(position) ?? [];
      // The same indicator can serve one position through two alternatives
      if (!list.some((x) => x.itemNumber === type.itemNumber)) {
        list.push({ itemNumber: type.itemNumber, label: type.label });
      }
      byPosition.set(position, list);
    }
  }
  return byPosition;
}
