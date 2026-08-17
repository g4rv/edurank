import { db } from '@/lib/db';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import { ON_ROSTER } from './roster';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import { DEFAULT_LIMITS, formulaShares } from '@/lib/stake/formula';
import { minimumKstHundredths } from '@/lib/stake/units';
import { isKnownDepartment } from '@/lib/specialities/departments';
import { EMPTY_BONUS, bonusForStaff, type StaffBonus } from './list-student-claims';

/**
 * Everything the distribution grid for one кафедра needs, in one read.
 *
 * The grid is додаток 2: «Обсяг ставки за формулою» beside «Розподілений обсяг
 * ставки», so both numbers travel together and the formula value is never
 * thrown away.
 *
 * The recruitment bonus is a SEPARATE column and must stay one. `Кст` bounds the
 * pool share only. What the bonus may NOT do is lift somebody above their own
 * Макс (2026-08-12) — that ceiling is applied in `payableStake`, at the edge,
 * because the head is moving «Розподілено» as they look at it.
 */
export interface StakeRow {
  staffId: string;
  name: string;
  rating: number;
  /** Their administrative position, or null — priced by ADMIN per year */
  adminPosition: AdminPosition | null;
  /** «позицій із 20» — whether this person counts towards Кнпп */
  positions: number;
  qualifies: boolean;
  minHundredths: number;
  maxHundredths: number;
  /** Has somebody set limits for this person, or are these the defaults? */
  hasOwnLimits: boolean;
  /** What the formula proposes, clamped and on the 0.05 ladder */
  formulaHundredths: number;
  /** Bumped to a bound — so the grid can explain a row that looks wrong */
  clampedTo: 'min' | 'max' | null;
  /** What the head has decided, falling back to the formula until they touch it */
  proposedHundredths: number;
  /**
   * Term 2 — the recruitment bonus, with the specialities it came from.
   *
   * Only CONFIRMED claims pay, and the value follows the STUDENT's speciality
   * wherever they enrolled. Kept a separate number from the pool share: `Кст`
   * bounds the share alone.
   */
  bonus: StaffBonus;
}

/**
 * What ADMIN is trying out, laid over the real numbers.
 *
 * Every field is an override and every one is optional, so an untouched sandbox
 * renders exactly the real кафедра — which is what makes the tab safe to open.
 */
export interface StakeSandboxOverlay {
  /** The pool being tried. Null = the кафедра's real `Кст`. */
  kstHundredths: number | null;
  /** staffId → hundredths typed into «Розподілено» */
  values: Record<string, number>;
  /** staffId → the caps being tried, overriding `StaffStakeLimits` */
  limits: Record<string, { min: number; max: number }>;
}

export interface StakeDistributionView {
  departmentId: string;
  departmentName: string;
  facultyName: string;
  year: number;
  rows: StakeRow[];
  /** `Кст`, or null when ADMIN has not set a pool for this кафедра */
  kstHundredths: number | null;
  /** 0.1 × headcount — the pool's own minimum */
  minimumKstHundredths: number;
  knpp: number;
  headcount: number;
  averageRating: number;
  /** False when `Кнпп` is zero or nobody has a rating — the grid says why */
  computable: boolean;
  /** Σ of the formula's own proposal. Rarely equals `Кст` — see the note below. */
  formulaTotalHundredths: number;
  /** Σ of what the head has decided */
  proposedTotalHundredths: number;
  /** Null until somebody has saved this кафедра's distribution */
  filledAt: Date | null;
  filledBy: string | null;
  /** True while the numbers are ADMIN's sandbox rather than the кафедра's own */
  sandbox: boolean;
  /**
   * Is this кафедра in `lib/specialities/departments.ts`?
   *
   * False turns the бонус chips gray instead of amber and puts a line under the
   * table saying why. The demo кафедри are invented, and amber there would
   * assert that everyone recruits for other кафедри — a claim we cannot support.
   */
  knownDepartment: boolean;
}

export async function getStakeDistribution(
  departmentId: string,
  year: number,
  overlay?: StakeSandboxOverlay | null
): Promise<StakeDistributionView | null> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, faculty: { select: { name: true } } },
  });
  if (!department) return null;

  const staff = await db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true, departmentId },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      // Drives the «Статуси» column. Read from the profile rather than ticked
      // per year: the position is already recorded there and already drives the
      // Характеристика (2026-08-17).
      adminPosition: true,
      ratingEntries: { where: { year }, select: { totalScore: true } },
      stakeLimits: { where: { year }, select: { minHundredths: true, maxHundredths: true } },
    },
  });

  const [stake, distribution, documents, bonuses] = await Promise.all([
    db.departmentStake.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { kstHundredths: true },
    }),
    db.stakeDistribution.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: {
        filledAt: true,
        filledBy: { select: { lastName: true, firstName: true, patronymic: true } },
        allocations: {
          select: { staffId: true, proposedHundredths: true },
        },
      },
    }),
    getKharakterystykaMany(
      staff.map((s) => s.id),
      year
    ),
    bonusForStaff(
      staff.map((s) => s.id),
      year
    ),
  ]);

  // The sandbox's pool wins where it has one; everything else falls through to
  // the кафедра's real numbers, so an untouched sandbox is the truth.
  const kstHundredths = overlay?.kstHundredths ?? stake?.kstHundredths ?? null;
  const knpp = staff.filter(
    (s) => (documents.get(s.id)?.metCount ?? 0) >= REQUIRED_POSITIONS
  ).length;

  /** This person's bounds, sandbox first, then their own row, then the defaults */
  function boundsFor(s: (typeof staff)[number]) {
    const tried = overlay?.limits[s.id];
    const own = s.stakeLimits[0];
    return {
      minHundredths: tried?.min ?? own?.minHundredths ?? DEFAULT_LIMITS.minHundredths,
      maxHundredths: tried?.max ?? own?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths,
      // The REAL row, never the sandbox's. A sandbox stores a number for
      // everybody the moment anything is saved, so counting those would make
      // every row look individually set and the dimming would stop meaning
      // «somebody decided this for this person».
      hasOwnLimits: !!own,
    };
  }

  const formula = formulaShares({
    people: staff.map((s) => ({
      staffId: s.id,
      rating: s.ratingEntries[0]?.totalScore ?? 0,
      ...boundsFor(s),
    })),
    kstHundredths: kstHundredths ?? 0,
  });
  const shareByStaff = new Map(formula.shares.map((s) => [s.staffId, s]));
  const allocationByStaff = new Map((distribution?.allocations ?? []).map((a) => [a.staffId, a]));

  const rows: StakeRow[] = staff
    .map((s) => {
      const share = shareByStaff.get(s.id)!;
      const allocation = allocationByStaff.get(s.id);
      const metCount = documents.get(s.id)?.metCount ?? 0;

      return {
        staffId: s.id,
        name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
        rating: share.rating,
        adminPosition: s.adminPosition,
        positions: metCount,
        qualifies: metCount >= REQUIRED_POSITIONS,
        ...boundsFor(s),
        formulaHundredths: share.hundredths,
        clampedTo: share.clampedTo,
        // Until somebody touches a row, the formula's proposal IS the proposal —
        // the screen opens on a defensible split rather than on a column of
        // blanks somebody has to fill in from nothing. A sandbox falls through
        // to the кафедра's real split before it falls through to the formula,
        // so ADMIN starts from what the head actually did.
        proposedHundredths:
          overlay?.values[s.id] ?? allocation?.proposedHundredths ?? share.hundredths,
        bonus: bonuses.get(s.id) ?? EMPTY_BONUS,
      };
    })
    // The order the formula spreads in, which is the order a head already
    // thinks in — highest rating first, name as the tie-break so it never wobbles.
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'uk'));

  const filledBy = distribution?.filledBy;

  return {
    departmentId: department.id,
    departmentName: department.name,
    facultyName: department.faculty.name,
    year,
    rows,
    kstHundredths,
    minimumKstHundredths: minimumKstHundredths(staff.length),
    knpp,
    headcount: staff.length,
    averageRating: formula.averageRating,
    computable: formula.computable,
    formulaTotalHundredths: formula.totalHundredths,
    proposedTotalHundredths: rows.reduce((sum, r) => sum + r.proposedHundredths, 0),
    // A sandbox has no author and no date. Showing the head's would credit them
    // with numbers they never typed.
    filledAt: overlay ? null : (distribution?.filledAt ?? null),
    filledBy:
      overlay || !filledBy
        ? null
        : `${filledBy.lastName} ${filledBy.firstName} ${filledBy.patronymic}`,
    sandbox: !!overlay,
    knownDepartment: isKnownDepartment(department.name),
  };
}
