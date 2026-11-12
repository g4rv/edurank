import { db } from '@/lib/db';
import { activityLineText } from '@/lib/kharakterystyka/build';
import { windowFor } from '@/lib/kharakterystyka/positions';
import { DOI_ONLY_POSITION, isSamePublication } from '@/lib/kharakterystyka/duplicates';
import { parseLicencePositions } from '@/validations/licence-positions';

/** The rating entry a saved line is a copy of */
export interface DuplicateOf {
  activityId: string;
  /** The rating year it was entered in */
  year: number;
  /** «3.9» */
  itemNumber: string;
  label: string;
  /** The entry as the document prints it */
  text: string;
}

/**
 * For each saved line, the rating entry of the SAME person that describes the
 * same publication — and feeds the same position (owner, 2026-11-12).
 *
 * Only an entry that counts is a copy of anything: approved, of an active
 * indicator, inside the window. A line whose twin was discarded on `/moderation`
 * is not a duplicate any more — hiding it would leave the work nowhere.
 *
 * A conference (п.12) matches on DOI alone: every conference description opens
 * with the same few words, and a text match would pair unrelated lines.
 *
 * Shared by the page (to list them) and the action (to judge them again — the
 * browser says which rows were ticked, never whether they are copies).
 */
export async function findRatingDuplicates(
  entries: readonly { id: string; staffId: string; position: number; text: string }[],
  lastYear: number
): Promise<Map<string, DuplicateOf>> {
  const found = new Map<string, DuplicateOf>();
  if (entries.length === 0) return found;

  const { from, to } = windowFor(lastYear);
  const activities = await db.activity.findMany({
    where: {
      staffId: { in: [...new Set(entries.map((e) => e.staffId))] },
      year: { gte: from, lte: to },
      status: 'APPROVED',
      activityType: { isActive: true },
    },
    select: {
      id: true,
      staffId: true,
      year: true,
      evidence: true,
      activityType: {
        select: { itemNumber: true, label: true, licencePositions: true, evidenceFields: true },
      },
    },
  });

  // The positions an entry feeds and what it prints, worked out once each
  const candidates = new Map<
    string,
    { positions: Set<number>; text: string; row: DuplicateOf }[]
  >();
  for (const a of activities) {
    const positions = new Set(
      parseLicencePositions(a.activityType.licencePositions).map((l) => l.position)
    );
    if (positions.size === 0) continue;
    const text = activityLineText(a.activityType, a.evidence);
    const list = candidates.get(a.staffId) ?? [];
    list.push({
      positions,
      text,
      row: {
        activityId: a.id,
        year: a.year,
        itemNumber: a.activityType.itemNumber,
        label: a.activityType.label,
        text,
      },
    });
    candidates.set(a.staffId, list);
  }

  for (const entry of entries) {
    const twin = (candidates.get(entry.staffId) ?? []).find(
      (c) =>
        c.positions.has(entry.position) &&
        isSamePublication(entry.text, c.text, { byText: entry.position !== DOI_ONLY_POSITION })
    );
    if (twin) found.set(entry.id, twin.row);
  }
  return found;
}
