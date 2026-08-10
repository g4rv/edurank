import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import { DEFAULT_LIMITS, formulaShares } from '@/lib/stake/formula';
import { minimumKstHundredths } from '@/lib/stake/units';

/**
 * Everything the distribution grid for one кафедра needs, in one read.
 *
 * The grid is додаток 2: «Обсяг ставки за формулою» beside «Розподілений обсяг
 * ставки», with «Обґрунтування» explaining any gap — so both numbers travel
 * together and the formula value is never thrown away.
 *
 * The recruitment bonus is a SEPARATE column and must stay one. `Кст` bounds the
 * pool share only; the bonus is paid on top of it, so a кафедра total above the
 * pool is correct exactly when the difference is the bonuses. Merging them makes
 * the ceiling impossible to enforce or to explain.
 */
export interface StakeRow {
  staffId: string;
  name: string;
  rating: number;
  /** «позицій із 20» — whether this person counts towards Кнпп */
  positions: number;
  qualifies: boolean;
  minHundredths: number;
  maxHundredths: number;
  /** Has ADMIN set limits, or are these the 0.1 / 1.5 defaults? */
  hasOwnLimits: boolean;
  /** What the formula proposes, clamped and on the 0.05 ladder */
  formulaHundredths: number;
  /** Bumped to a bound — so the grid can explain a row that looks wrong */
  clampedTo: 'min' | 'max' | null;
  /** What the head has decided, falling back to the formula until they touch it */
  proposedHundredths: number;
  justification: string | null;
  /**
   * Term 2 — the recruitment bonus, in ставки.
   *
   * Always 0 today: `StudentClaim` is not built yet, so nobody has recruited
   * anybody as far as the app knows. The column exists from the start
   * deliberately — the spec's central warning is that merging it into the pool
   * share breaks the ceiling, and a column added later is a column somebody
   * merges in the meantime.
   */
  bonus: number;
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
}

export async function getStakeDistribution(
  departmentId: string,
  year: number
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
      ratingEntries: { where: { year }, select: { totalScore: true } },
      stakeLimits: { where: { year }, select: { minHundredths: true, maxHundredths: true } },
    },
  });

  const [stake, distribution, documents] = await Promise.all([
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
          select: { staffId: true, proposedHundredths: true, justification: true },
        },
      },
    }),
    getKharakterystykaMany(
      staff.map((s) => s.id),
      year
    ),
  ]);

  const kstHundredths = stake?.kstHundredths ?? null;
  const knpp = staff.filter(
    (s) => (documents.get(s.id)?.metCount ?? 0) >= REQUIRED_POSITIONS
  ).length;

  const people = staff.map((s) => {
    const own = s.stakeLimits[0];
    return {
      staffId: s.id,
      rating: s.ratingEntries[0]?.totalScore ?? 0,
      minHundredths: own?.minHundredths ?? DEFAULT_LIMITS.minHundredths,
      maxHundredths: own?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths,
    };
  });

  const formula = formulaShares({ people, kstHundredths: kstHundredths ?? 0, knpp });
  const shareByStaff = new Map(formula.shares.map((s) => [s.staffId, s]));
  const allocationByStaff = new Map((distribution?.allocations ?? []).map((a) => [a.staffId, a]));

  const rows: StakeRow[] = staff
    .map((s) => {
      const share = shareByStaff.get(s.id)!;
      const allocation = allocationByStaff.get(s.id);
      const own = s.stakeLimits[0];
      const metCount = documents.get(s.id)?.metCount ?? 0;

      return {
        staffId: s.id,
        name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
        rating: share.rating,
        positions: metCount,
        qualifies: metCount >= REQUIRED_POSITIONS,
        minHundredths: own?.minHundredths ?? DEFAULT_LIMITS.minHundredths,
        maxHundredths: own?.maxHundredths ?? DEFAULT_LIMITS.maxHundredths,
        hasOwnLimits: !!own,
        formulaHundredths: share.hundredths,
        clampedTo: share.clampedTo,
        // Until the head touches a row, the formula's proposal IS the proposal —
        // the screen opens on a defensible split rather than on a column of
        // blanks somebody has to fill in from nothing.
        proposedHundredths: allocation?.proposedHundredths ?? share.hundredths,
        justification: allocation?.justification ?? null,
        bonus: 0,
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
    filledAt: distribution?.filledAt ?? null,
    filledBy: filledBy ? `${filledBy.lastName} ${filledBy.firstName} ${filledBy.patronymic}` : null,
  };
}
