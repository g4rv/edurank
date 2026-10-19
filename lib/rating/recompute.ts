import type { Prisma } from '@/lib/generated/prisma/client';
import { round2 } from '@/lib/round';
import { blockedStaff } from './rating-gate';

// Rolls approved activity scores up into the cached RatingEntry for one staff/year.
// Called inside the same transaction as the mutation that changed the activities
// (submit, discard, division entry) so the rollup never drifts from the rows.

export interface SectionScoreRow {
  score: number;
  sectionNumber: number;
}

export interface SectionTotals {
  section1Score: number;
  section2Score: number;
  section3Score: number;
  section4Score: number;
  section5Score: number;
  totalScore: number;
}

/**
 * Round to 2 decimals. Each Activity.score is already rounded, but summing them
 * with `+=` reintroduces binary-float dust (0.1 + 0.2 = 0.30000000000000004),
 * and that dust would be written straight into RatingEntry. Round the buckets so
 * the DB only ever holds clean 2-decimal values — the fix is on the stored value,
 * not the display.
 */
/** Pure rollup: sums scores into the five section buckets (unknown sections are ignored) */
export function sumBySection(rows: SectionScoreRow[]): SectionTotals {
  const sections = [0, 0, 0, 0, 0];
  for (const row of rows) {
    if (row.sectionNumber >= 1 && row.sectionNumber <= 5) {
      sections[row.sectionNumber - 1] += row.score;
    }
  }
  const [section1Score, section2Score, section3Score, section4Score, section5Score] =
    sections.map(round2);
  return {
    section1Score,
    section2Score,
    section3Score,
    section4Score,
    section5Score,
    // Sum the rounded buckets so the total agrees with the parts to the last digit
    totalScore: round2(
      section1Score + section2Score + section3Score + section4Score + section5Score
    ),
  };
}

/**
 * Only APPROVED rows of a still-active indicator count. Deactivating an
 * ActivityType (`isActive = false`) therefore drops its points out of every
 * total immediately — the rows stay for history, but score nothing.
 */
const COUNTED = {
  status: 'APPROVED',
  activityType: { isActive: true },
} satisfies Pick<Prisma.ActivityWhereInput, 'status' | 'activityType'>;

/** Recomputes and upserts the RatingEntry for one staff/year from APPROVED activities */
export async function recomputeRatingEntry(
  tx: Prisma.TransactionClient,
  staffId: string,
  year: number
): Promise<SectionTotals> {
  const activities = await tx.activity.findMany({
    where: { staffId, year, ...COUNTED },
    select: { score: true, activityType: { select: { section: { select: { number: true } } } } },
  });

  // Until 5.1 is filled the year counts as 0 (owner, 2026-10-16) — see rating-gate.ts
  const blocked = (await blockedStaff(tx, [staffId], year)).has(staffId);
  const totals = sumBySection(
    blocked
      ? []
      : activities.map((a) => ({ score: a.score, sectionNumber: a.activityType.section.number }))
  );

  await tx.ratingEntry.upsert({
    where: { staffId_year: { staffId, year } },
    create: { staffId, year, ...totals },
    update: totals,
  });

  return totals;
}

/**
 * Everyone with a total in the year, recomputed — for a change to the gate
 * itself (`ActivityType.gatesRating`, 5.1). Switching it on or off, or turning
 * such an indicator on or off, decides whether a whole year counts for people
 * who do NOT hold it; recomputing only its holders left the rest on a stale
 * total. Somebody with no entry has no stored total to correct. Returns how
 * many were recomputed.
 */
export async function recomputeYearEntries(
  tx: Prisma.TransactionClient,
  year: number,
  alsoStaffIds: readonly string[] = []
): Promise<number> {
  const entries = await tx.ratingEntry.findMany({ where: { year }, select: { staffId: true } });
  const staffIds = [...new Set([...entries.map((e) => e.staffId), ...alsoStaffIds])];
  await recomputeRatingEntries(tx, staffIds, year);
  return staffIds.length;
}

/**
 * Same rollup for many staff at once: ONE read for all their activities, then
 * one upsert each — instead of a read per person. Used after template-level
 * edits (indicator deactivated, coefficient changed) that move many ratings.
 */
export async function recomputeRatingEntries(
  tx: Prisma.TransactionClient,
  staffIds: string[],
  year: number
): Promise<void> {
  if (staffIds.length === 0) return;

  const activities = await tx.activity.findMany({
    where: { staffId: { in: staffIds }, year, ...COUNTED },
    select: {
      staffId: true,
      score: true,
      activityType: { select: { section: { select: { number: true } } } },
    },
  });

  const rowsByStaff = new Map<string, SectionScoreRow[]>();
  for (const a of activities) {
    const rows = rowsByStaff.get(a.staffId) ?? [];
    rows.push({ score: a.score, sectionNumber: a.activityType.section.number });
    rowsByStaff.set(a.staffId, rows);
  }

  // Until 5.1 is filled the year counts as 0 (owner, 2026-10-16) — see rating-gate.ts
  const blocked = await blockedStaff(tx, staffIds, year);

  // Iterate staffIds, not the map: someone whose last counting row just went
  // away has no activities left and still needs their entry zeroed.
  for (const staffId of staffIds) {
    const totals = sumBySection(blocked.has(staffId) ? [] : (rowsByStaff.get(staffId) ?? []));
    await tx.ratingEntry.upsert({
      where: { staffId_year: { staffId, year } },
      create: { staffId, year, ...totals },
      update: totals,
    });
  }
}
