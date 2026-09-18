import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * наказ №152 п.3 — «не менше 500 годин на одну науково-педагогічну ставку. У
 * випадках, коли НПП працюють не на ставку, обсяг наукових видів робіт
 * встановлюється пропорційно до фактичного обсягу ставки».
 *
 * Everything is INTEGER HUNDREDTHS. `minHoursPerRate` is whole hours from the
 * template, `rateHundredths` is the ставка, and the product of the two is
 * already in hundredths of an hour — no rounding, no float, by construction.
 */
export interface PlanTarget {
  rateHundredths: number | null;
  /** null when there is no ставка: show no target at all, not a guess. */
  targetHundredths: number | null;
  plannedHundredths: number;
  /** null when there is no target; never negative — an excess is not a shortfall. */
  shortfallHundredths: number | null;
  /**
   * What was actually RECORDED — APPROVED draws only, so a declined record
   * stops counting the moment ННВ declines it (D20).
   *
   * План and факт are measured against the SAME ціль and shown together, which
   * is what makes D29's two tabs cost nothing to switch between: the numbers
   * both live in the band above them.
   */
  doneHundredths: number;
  /** null when there is no target; never negative. */
  doneShortfallHundredths: number | null;
}

export function planTarget(input: {
  minHoursPerRate: number;
  rateHundredths: number | null;
  plannedHundredths: number;
  /**
   * Required rather than defaulted, deliberately: a screen that forgets to
   * pass it would otherwise read a confident zero, and «Виконано 0 год» is a
   * statement about somebody's year, not a missing argument.
   */
  doneHundredths: number;
}): PlanTarget {
  const { minHoursPerRate, rateHundredths, plannedHundredths, doneHundredths } = input;
  if (rateHundredths === null) {
    return {
      rateHundredths: null,
      targetHundredths: null,
      plannedHundredths,
      shortfallHundredths: null,
      doneHundredths,
      doneShortfallHundredths: null,
    };
  }
  const targetHundredths = minHoursPerRate * rateHundredths;
  return {
    rateHundredths,
    targetHundredths,
    plannedHundredths,
    shortfallHundredths: Math.max(0, targetHundredths - plannedHundredths),
    doneHundredths,
    doneShortfallHundredths: Math.max(0, targetHundredths - doneHundredths),
  };
}

/**
 * The ставка this person holds ON THIS кафедра — never `Staff.employmentRate`,
 * which is the SUM across every кафедра that pays them (`lib/stake/employment-rate.ts`).
 * Using the sum would target each of a сумісник's two plans at their whole
 * workload and ask for 500 годин twice.
 *
 * `null` when the кафедра has not saved its розподіл. Measured on dev
 * 2026-09-15: 306 of 328 НПП had no allocation at all, so this is the common
 * case in September, not an edge case.
 */
export async function rateForPlan(
  tx: Prisma.TransactionClient,
  where: { staffId: string; departmentId: string; stakeYear: number }
): Promise<number | null> {
  const allocation = await tx.stakeAllocation.findFirst({
    where: {
      staffId: where.staffId,
      distribution: { departmentId: where.departmentId, year: where.stakeYear },
    },
    select: { proposedHundredths: true },
  });
  return allocation?.proposedHundredths ?? null;
}
