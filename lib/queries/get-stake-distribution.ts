import { db } from '@/lib/db';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import { ON_ROSTER, onDepartment } from './roster';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import { DEFAULT_LIMITS, PART_TIME_LIMITS, formulaShares } from '@/lib/stake/formula';
import { minimumKstHundredths } from '@/lib/stake/units';
import { isKnownDepartment } from '@/lib/specialities/departments';
import { EMPTY_BONUS, bonusForStaff, type StaffBonus } from './list-student-claims';
import { ratingYearFor } from '@/lib/stake/rating-year';

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
  /**
   * This кафедра is their ADDITIONAL one — they sit primarily elsewhere.
   *
   * Drives three things and nothing else: the «Сумісник» badge, the sort to the
   * bottom, and which default bounds apply. Their rating, their bonus and their
   * place in the formula are exactly the same as anybody else's (2026-08-24).
   */
  isPartTime: boolean;
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

export interface StakeDistributionView {
  departmentId: string;
  departmentName: string;
  facultyName: string;
  year: number;
  rows: StakeRow[];
  /** `Кст`, or null when ADMIN has not set a pool for this кафедра */
  kstHundredths: number | null;
  /** The second pool, or null until the проректор allocates it. The formula never reads it. */
  bonusPoolHundredths: number | null;
  /**
   * Which year's rating this split was ranked on — usually `year - 1`.
   *
   * On the view rather than implied, because an all-zero rating column is only
   * explainable once the screen says which year it came from.
   */
  ratingYear: number;
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
  year: number
): Promise<StakeDistributionView | null> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, faculty: { select: { name: true } } },
  });
  if (!department) return null;

  // The ставки are for `year`; the work they reward was done in this one.
  const ratingYear = await ratingYearFor(year);

  const staff = await db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true, ...onDepartment(departmentId) },
    select: {
      id: true,
      // Compared against the кафедра being viewed — this is what tells a
      // primary row from a сумісник's, and no extra column is needed for it.
      departmentId: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      // Drives the «Статуси» column. Read from the profile rather than ticked
      // per year: the position is already recorded there and already drives the
      // Характеристика (2026-08-17).
      adminPosition: true,
      ratingEntries: { where: { year: ratingYear }, select: { totalScore: true } },
      // Scoped to THIS кафедра: bounds are per-кафедра since 2026-08-24, and an
      // unscoped read would hand a сумісник their own кафедра's 1,00 ceiling.
      stakeLimits: {
        where: { year, departmentId },
        select: { minHundredths: true, maxHundredths: true },
      },
    },
  });

  const [stake, distribution, documents, bonuses] = await Promise.all([
    db.departmentStake.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { kstHundredths: true, bonusPoolHundredths: true },
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
    // Every id, сумісники included — and that is the whole rule (2026-08-24).
    // A сумісник's recruited students show on BOTH кафедри's grids, because the
    // bonus is a signal about the person rather than a fixed sum, and a head who
    // sees that this person filled their OWN programmes can weigh it. The
    // green/amber colouring resolves against the кафедра being viewed, so both
    // heads get the right picture from the same data. Do not add a per-кафедра
    // bonus rule; there deliberately is none.
    bonusForStaff(
      staff.map((s) => s.id),
      year
    ),
  ]);

  const kstHundredths = stake?.kstHundredths ?? null;
  /** The second pool. The formula never reads it — it is spread by hand. */
  const bonusPoolHundredths = stake?.bonusPoolHundredths ?? null;
  /** Is this кафедра their additional one? */
  const isPartTime = (s: (typeof staff)[number]) => s.departmentId !== departmentId;

  // Primary кафедра only — Кнпп is the п.38 licence figure and one person
  // cannot be claimed by two кафедри. `headcount` below deliberately differs.
  const knpp = staff.filter(
    (s) => !isPartTime(s) && (documents.get(s.id)?.metCount ?? 0) >= REQUIRED_POSITIONS
  ).length;

  /**
   * This person's bounds on THIS кафедра — their own row, or the defaults.
   *
   * The fallback differs by row type and never crosses кафедри: a сумісник with
   * no row of their own gets 0,10–0,25, not whatever ADMIN typed for them on
   * their primary кафедра.
   */
  function boundsFor(s: (typeof staff)[number]) {
    const own = s.stakeLimits[0];
    const fallback = isPartTime(s) ? PART_TIME_LIMITS : DEFAULT_LIMITS;
    return {
      minHundredths: own?.minHundredths ?? fallback.minHundredths,
      maxHundredths: own?.maxHundredths ?? fallback.maxHundredths,
      /** Dimming keys off this: «somebody decided this for this person» */
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
        isPartTime: isPartTime(s),
        positions: metCount,
        qualifies: metCount >= REQUIRED_POSITIONS,
        ...boundsFor(s),
        formulaHundredths: share.hundredths,
        clampedTo: share.clampedTo,
        // Until somebody touches a row, the formula's proposal IS the proposal —
        // the screen opens on a defensible split rather than on a column of
        // blanks somebody has to fill in from nothing.
        proposedHundredths: allocation?.proposedHundredths ?? share.hundredths,
        bonus: bonuses.get(s.id) ?? EMPTY_BONUS,
      };
    })
    // Сумісники last as a block, then the order the formula spreads in — which
    // is the order a head already thinks in. Display only: the formula does not
    // read this. Name as the final tie-break so it never wobbles.
    .sort(
      (a, b) =>
        Number(a.isPartTime) - Number(b.isPartTime) ||
        b.rating - a.rating ||
        a.name.localeCompare(b.name, 'uk')
    );

  const filledBy = distribution?.filledBy;

  return {
    departmentId: department.id,
    departmentName: department.name,
    facultyName: department.faculty.name,
    year,
    ratingYear,
    rows,
    kstHundredths,
    bonusPoolHundredths,
    minimumKstHundredths: minimumKstHundredths(staff.length),
    knpp,
    headcount: staff.length,
    averageRating: formula.averageRating,
    computable: formula.computable,
    formulaTotalHundredths: formula.totalHundredths,
    proposedTotalHundredths: rows.reduce((sum, r) => sum + r.proposedHundredths, 0),
    filledAt: distribution?.filledAt ?? null,
    filledBy: filledBy ? `${filledBy.lastName} ${filledBy.firstName} ${filledBy.patronymic}` : null,
    knownDepartment: isKnownDepartment(department.name),
  };
}
