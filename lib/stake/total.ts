// «Разом» — what one person is actually paid, once their ceiling has had its say.
//
// The bonus for recruited students does NOT rise above a person's Макс
// (2026-08-12). Somebody already at their ceiling from the pool gets nothing
// more from recruitment, however many students they brought in; if they should
// hold more, they ask the проректор, who tells the head to raise that one
// person. So the recruitment figure is closer to an extra rating score than to
// an extra ставка, and a column promising money that will not be paid is worse
// than no column at all.
//
// This replaces the earlier «виплачується понад виділені ставки, без стелі» —
// see docs/stake-distribution.md, rewritten in the same change.
//
// The ceiling bites the BONUS, never the pool share. A head's saved allocation
// is a decision that was already checked against the caps; when ADMIN later
// lowers a cap under it, the right thing on screen is a distributed number
// flagged out of range — not a «Разом» quietly smaller than the ставка the
// кафедра agreed.

import { fromHundredths, roundBonus } from './units';

export interface PayableStake {
  /** What lands, in ставки: the pool share plus as much bonus as fits */
  total: number;
  /** The bonus actually paid — `bonus` unless the ceiling took some of it */
  paidBonus: number;
  /** The part of the bonus the ceiling swallowed. Zero when it all fits. */
  overflow: number;
}

/**
 * One person's «Разом».
 *
 * ```
 * Разом = розподілено + min(бонус, Макс − розподілено)
 * ```
 *
 * All three figures are rounded to three decimals, the precision the university
 * already records a bonus at — a заочний контрактний здобувач is worth about
 * 0.004 and would vanish at two.
 */
export function payableStake(
  distributedHundredths: number,
  bonus: number,
  maxHundredths: number
): PayableStake {
  const distributed = fromHundredths(distributedHundredths);
  const room = Math.max(0, fromHundredths(maxHundredths) - distributed);
  const paidBonus = Math.min(Math.max(bonus, 0), room);

  return {
    total: roundBonus(distributed + paidBonus),
    paidBonus: roundBonus(paidBonus),
    overflow: roundBonus(Math.max(bonus, 0) - paidBonus),
  };
}
