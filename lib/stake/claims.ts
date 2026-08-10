// Recruited-student claims — the pure half. No DB, no UI.
//
// Two jobs: deciding when two people have typed the same student, and turning
// a set of claims into the bonus each recruiter has earned.

import { studentValue, type Funding, type StudentDegree, type StudyForm } from './norms';
import { roundBonus } from './units';

/**
 * The key two claims are compared on.
 *
 * Trim, collapse runs of whitespace, lower-case, and normalise the apostrophes
 * and dashes Ukrainian names are written with in three or four different ways.
 * Nothing cleverer: the point is to catch «Петренко  О.І.» against «петренко
 * О. І.», not to guess that «Петренко О.» and «Петренко Олена» are one person.
 *
 * Near-misses this does NOT catch are surfaced to the head as separate rows
 * rather than silently merged — people mistype even when copying from the
 * наказ, and a wrong merge hides a real second claim.
 */
export function normaliseStudentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’ʼ‘`´]/g, "'") // ’ ʼ ‘ ` ´ → '
    .replace(/[‐-―−]/g, '-') // various dashes → -
    .replace(/\s+/g, ' ');
}

/** Everything the bonus needs about one claim */
export interface BonusClaim {
  staffId: string;
  /** Only CONFIRMED claims pay; the caller does not have to pre-filter */
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
  /** The норматив of the STUDENT's speciality, or null when the year has none set */
  base: number | null;
}

/**
 * What one claim is worth, in ставки. Zero for anything not confirmed, and zero
 * for a speciality with no норматив for the year — a student nobody has priced
 * cannot be paid for, and returning zero says so without inventing a number.
 */
export function claimValue(claim: BonusClaim, contractCoefficient: number): number {
  if (claim.status !== 'CONFIRMED') return 0;
  if (claim.base === null) return 0;
  return studentValue(claim.base, claim.degree, claim.form, claim.funding, contractCoefficient);
}

/**
 * Bonus per recruiter, keyed by staff id.
 *
 * Summed at FULL precision and rounded once at the end. Rounding each student
 * and adding the results is half of how the old system produced a negative
 * «нерозподілено»; a заочний контрактний здобувач is worth about 0.004, so
 * three of them rounded first are worth nothing at all.
 */
export function bonusByStaff(
  claims: readonly BonusClaim[],
  contractCoefficient: number
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const claim of claims) {
    const value = claimValue(claim, contractCoefficient);
    if (value === 0) continue;
    totals.set(claim.staffId, (totals.get(claim.staffId) ?? 0) + value);
  }
  for (const [staffId, total] of totals) totals.set(staffId, roundBonus(total));
  return totals;
}

/** One claim as the duplicate grouping sees it */
export interface GroupableClaim {
  id: string;
  staffId: string;
  studentNameNormalised: string;
  specialityId: string;
  createdAt: Date;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
}

/**
 * Claims contested by more than one person.
 *
 * A duplicate means the SAME student claimed by DIFFERENT НПП — same normalised
 * name and same speciality. One person's own repeat is refused by the database,
 * so it cannot appear here.
 *
 * A REJECTED claim stops contesting anything: once the head has ruled it out it
 * is not evidence of a conflict any more, and leaving it in would keep a
 * settled row on the screen for ever.
 */
export function contestedKeys(claims: readonly GroupableClaim[]): Set<string> {
  const claimants = new Map<string, Set<string>>();
  for (const c of claims) {
    if (c.status === 'REJECTED') continue;
    const key = duplicateKey(c);
    const set = claimants.get(key) ?? new Set<string>();
    set.add(c.staffId);
    claimants.set(key, set);
  }
  return new Set([...claimants].filter(([, staff]) => staff.size > 1).map(([key]) => key));
}

/** Same student, same programme — what makes two rows the same claim */
export function duplicateKey(claim: {
  studentNameNormalised: string;
  specialityId: string;
}): string {
  return `${claim.studentNameNormalised}|${claim.specialityId}`;
}

/**
 * Who filed first within each contested group.
 *
 * Evidence for the head, not a verdict: there is no automatic winner and no
 * «assign to» button. The system's job is to make the pattern visible — who was
 * first, and how many of a person's claims are contested — and the resolution
 * happens in a conversation off-screen (decided 2026-08-07).
 */
export function firstClaimIds(claims: readonly GroupableClaim[]): Set<string> {
  const earliest = new Map<string, GroupableClaim>();
  for (const c of claims) {
    if (c.status === 'REJECTED') continue;
    const key = duplicateKey(c);
    const current = earliest.get(key);
    // Ties broken by id so the marker never moves between two identical stamps
    if (
      !current ||
      c.createdAt < current.createdAt ||
      (c.createdAt.getTime() === current.createdAt.getTime() && c.id < current.id)
    ) {
      earliest.set(key, c);
    }
  }
  return new Set([...earliest.values()].map((c) => c.id));
}

/**
 * How many of each person's claims are contested.
 *
 * One contested claim is noise. «Seven of this person's nine claims are
 * contested» is a pattern, and it is the number the head actually needs — which
 * is why it is counted per person rather than only shown per row.
 */
export function contestedCountByStaff(claims: readonly GroupableClaim[]): Map<string, number> {
  const contested = contestedKeys(claims);
  const counts = new Map<string, number>();
  for (const c of claims) {
    if (c.status === 'REJECTED') continue;
    if (!contested.has(duplicateKey(c))) continue;
    counts.set(c.staffId, (counts.get(c.staffId) ?? 0) + 1);
  }
  return counts;
}
