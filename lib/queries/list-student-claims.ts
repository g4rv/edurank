import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';
import { getStakeYearSettings } from './list-stake-settings';
import {
  bonusByStaff,
  claimValue,
  contestedCountByStaff,
  contestedKeys,
  duplicateKey,
  firstClaimByKey,
} from '@/lib/stake/claims';
import type { ClaimStatus } from '@/lib/generated/prisma/client';

const CLAIM_SELECT = {
  id: true,
  staffId: true,
  year: true,
  studentName: true,
  studentNameNormalised: true,
  specialityId: true,
  degree: true,
  form: true,
  funding: true,
  status: true,
  rejectReason: true,
  createdAt: true,
  speciality: { select: { name: true, norms: true } },
} as const;

/** The норматив of each claim's speciality for the year, or null if unset */
function baseFor(
  claim: { speciality: { norms: { year: number; base: number }[] } },
  year: number
): number | null {
  return claim.speciality.norms.find((n) => n.year === year)?.base ?? null;
}

export interface MyClaim {
  id: string;
  studentName: string;
  speciality: string;
  degree: 'BACHELOR' | 'MASTER';
  form: 'FULL_TIME' | 'PART_TIME';
  funding: 'STATE' | 'CONTRACT';
  status: ClaimStatus;
  rejectReason: string | null;
  /** What this claim would add, or does add once confirmed */
  value: number;
  /** No норматив for this speciality this year — it can pay nothing yet */
  unpriced: boolean;
  createdAt: Date;
}

/**
 * One НПП's own claims.
 *
 * They are shown the value of every claim including the ones that are secretly
 * contested, because they are **not told about conflicts** — the duplicate is
 * shown only to the person who can judge it. So the total has to be labelled as
 * possible rather than earned, which the page does.
 */
export async function listMyClaims(
  staffId: string,
  year: number
): Promise<{ claims: MyClaim[]; potential: number; confirmed: number }> {
  const [rows, settings] = await Promise.all([
    db.studentClaim.findMany({
      where: { staffId, year },
      select: CLAIM_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    getStakeYearSettings(year),
  ]);

  const claims: MyClaim[] = rows.map((r) => {
    const base = baseFor(r, year);
    return {
      id: r.id,
      studentName: r.studentName,
      speciality: r.speciality.name,
      degree: r.degree,
      form: r.form,
      funding: r.funding,
      status: r.status,
      rejectReason: r.rejectReason,
      // Priced as though confirmed, so «what this is worth» is answerable while
      // it is still pending — that is the number the person came to see.
      value: claimValue(
        { staffId, status: 'CONFIRMED', degree: r.degree, form: r.form, funding: r.funding, base },
        settings.contractCoefficient
      ),
      unpriced: base === null,
      createdAt: r.createdAt,
    };
  });

  return {
    claims,
    potential: claims.filter((c) => c.status !== 'REJECTED').reduce((sum, c) => sum + c.value, 0),
    confirmed: claims.filter((c) => c.status === 'CONFIRMED').reduce((sum, c) => sum + c.value, 0),
  };
}

export interface ReviewClaim extends MyClaim {
  claimedBy: string;
  claimedByStaffId: string;
  /** Somebody else has claimed this student on this programme too */
  contested: boolean;
  /** This is the earliest surviving claim in its group */
  wasFirst: boolean;
  /** How many of THIS person's claims are contested — the pattern, not the row */
  claimantContestedCount: number;
  /**
   * Who got in first, on a contested row that is NOT the first one. Null on
   * every other row.
   *
   * Naming them is the point: «спірна» on its own tells the head there is a
   * problem and gives them nowhere to go. The first claimant can sit in any
   * кафедра in the university, which is why `firstClaimedByDepartment` is
   * carried too — «talk to the other claimant» is unactionable if the head
   * cannot tell where to find them.
   */
  firstClaimedBy: string | null;
  /** Set only when that person is outside the кафедра being reviewed */
  firstClaimedByDepartment: string | null;
}

/**
 * Every claim filed by the staff of one кафедра, with the duplicates worked out.
 *
 * Deliberately a REPORT. There is no in-system winner: the head sees the
 * duplicates, who claimed first, and how many of each person's claims are
 * contested — and then they talk to that person. The resolution happens
 * off-screen, so there is no «assign to» button and no verdict field (decided
 * 2026-08-07). Confirm and reject are the only controls, one claim at a time.
 *
 * Duplicates are found across the WHOLE year, not just this кафедра: the
 * colleague who claimed the same student may sit anywhere in the university.
 */
export async function listClaimsForReview(
  departmentId: string,
  year: number
): Promise<ReviewClaim[]> {
  const staff = await db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true, departmentId },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  if (staff.length === 0) return [];

  const nameById = new Map(
    staff.map((s) => [s.id, `${s.lastName} ${s.firstName} ${s.patronymic}`])
  );

  const own = await db.studentClaim.findMany({
    where: { year, staffId: { in: staff.map((s) => s.id) } },
    select: CLAIM_SELECT,
    orderBy: { createdAt: 'asc' },
  });
  if (own.length === 0) return [];

  // The other side of a duplicate can be anybody in the university, so the
  // grouping runs over every claim on the same students — not only this
  // кафедра's. Scoped to the names in play rather than the whole year.
  const [everyone, settings] = await Promise.all([
    db.studentClaim.findMany({
      where: {
        year,
        studentNameNormalised: { in: [...new Set(own.map((c) => c.studentNameNormalised))] },
      },
      select: {
        id: true,
        staffId: true,
        studentNameNormalised: true,
        specialityId: true,
        createdAt: true,
        status: true,
      },
    }),
    getStakeYearSettings(year),
  ]);

  const contested = contestedKeys(everyone);
  const firstByKey = firstClaimByKey(everyone);
  const first = new Set([...firstByKey.values()].map((c) => c.id));
  const perStaff = contestedCountByStaff(everyone);

  // Name whoever filed first on each contested row. They can be anybody in the
  // university, so `nameById` (this кафедра only) is not enough — the missing
  // ones are looked up in one extra query rather than N.
  const outsiderIds = new Set(
    [...firstByKey.values()].map((c) => c.staffId).filter((id) => !nameById.has(id))
  );
  const outsiders =
    outsiderIds.size > 0
      ? await db.staff.findMany({
          where: { id: { in: [...outsiderIds] } },
          select: {
            id: true,
            lastName: true,
            firstName: true,
            patronymic: true,
            department: { select: { name: true } },
          },
        })
      : [];
  const outsiderById = new Map(outsiders.map((s) => [s.id, s]));

  return own.map((r) => {
    const base = baseFor(r, year);
    const key = duplicateKey(r);
    const isContested = contested.has(key);
    const winner = firstByKey.get(key);
    // Only worth naming on a row that lost the race — on the first row itself
    // the answer is «you», and on an uncontested row there is nobody to name.
    const loserToFirst = isContested && winner && winner.id !== r.id ? winner : null;
    const outsider = loserToFirst ? outsiderById.get(loserToFirst.staffId) : undefined;

    return {
      id: r.id,
      studentName: r.studentName,
      speciality: r.speciality.name,
      degree: r.degree,
      form: r.form,
      funding: r.funding,
      status: r.status,
      rejectReason: r.rejectReason,
      value: claimValue(
        {
          staffId: r.staffId,
          status: 'CONFIRMED',
          degree: r.degree,
          form: r.form,
          funding: r.funding,
          base,
        },
        settings.contractCoefficient
      ),
      unpriced: base === null,
      createdAt: r.createdAt,
      claimedBy: nameById.get(r.staffId) ?? '—',
      claimedByStaffId: r.staffId,
      contested: isContested,
      wasFirst: first.has(r.id),
      claimantContestedCount: perStaff.get(r.staffId) ?? 0,
      firstClaimedBy: loserToFirst
        ? (nameById.get(loserToFirst.staffId) ??
          (outsider
            ? `${outsider.lastName} ${outsider.firstName} ${outsider.patronymic}`
            : 'інший працівник'))
        : null,
      firstClaimedByDepartment: outsider?.department?.name ?? null,
    };
  });
}

/**
 * Confirmed bonus per person, for the distribution grid's «Бонус» column.
 *
 * Only CONFIRMED claims pay — that is the whole point of the queue. A claim on
 * a speciality with no норматив for the year pays nothing either, and shows as
 * unpriced on the person's own list rather than silently as zero.
 */
export async function bonusForStaff(
  staffIds: readonly string[],
  year: number
): Promise<Map<string, number>> {
  if (staffIds.length === 0) return new Map();

  const [claims, settings] = await Promise.all([
    db.studentClaim.findMany({
      where: { year, status: 'CONFIRMED', staffId: { in: [...staffIds] } },
      select: {
        staffId: true,
        status: true,
        degree: true,
        form: true,
        funding: true,
        speciality: { select: { norms: true } },
      },
    }),
    getStakeYearSettings(year),
  ]);

  return bonusByStaff(
    claims.map((c) => ({
      staffId: c.staffId,
      status: c.status,
      degree: c.degree,
      form: c.form,
      funding: c.funding,
      base: baseFor(c, year),
    })),
    settings.contractCoefficient
  );
}

/** The whole speciality list — never filtered to the recruiter's own кафедра */
export async function listSpecialities() {
  return db.speciality.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
