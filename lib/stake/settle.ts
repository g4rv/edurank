import { MIN_STAKE, floorToStep } from './units';

// Where one person's ставка lands once every rule has had its say.
//
// Four rules meet on a single number, and they used to be four expressions
// scattered through the grid component:
//
// 1. the person's own Мін/Макс — absolute, and the server refuses anything else;
// 2. «тільки збільшити» — the formula's share is the floor a head works up from;
// 3. what is left of the two funds — a raise stops at what actually fits;
// 4. the 0,05 ladder — the server refuses anything off it.
//
// They interact, so they live together and are tested together.

export interface StakeBounds {
  /** The person's floor, before `MIN_STAKE` is applied */
  minHundredths: number;
  /** The person's ceiling */
  maxHundredths: number;
  /** What the formula proposes for them — the «тільки збільшити» floor */
  formulaHundredths: number;
  /** What the кафедра still has across BOTH funds. Negative is read as zero. */
  headroom: number;
  /**
   * The кафедра is already over its funds.
   *
   * Lifts «тільки збільшити» so the way out of an overspend is not itself
   * forbidden. Refusing an overspend outright was tried and deadlocked the grid:
   * the formula's own proposal can sit above `Кст` from ladder rounding alone,
   * and a head may only raise a value, so there was no legal move at all.
   */
  overspent: boolean;
}

/** The person's floor, never under the university's absolute 0,10 */
export function lowerBound(b: Pick<StakeBounds, 'minHundredths'>): number {
  return Math.max(b.minHundredths, MIN_STAKE);
}

/** The person's ceiling, never under their own floor */
export function upperBound(b: Pick<StakeBounds, 'minHundredths' | 'maxHundredths'>): number {
  return Math.max(b.maxHundredths, lowerBound(b));
}

/**
 * The highest this row may go: its ceiling, or what the funds still hold.
 *
 * **Snapped DOWN to the ladder.** The funds are typed freely, so a `Кст` of 2,03
 * leaves 0,03 — and paying that out would produce an off-ladder ставка the
 * server rejects. The three kopecks stay in the fund instead: «better that 0,05
 * is left over than that it goes to −100» (owner, 2026-08-17).
 */
export function stakeCeiling(current: number, b: StakeBounds): number {
  return Math.min(upperBound(b), floorToStep(current + Math.max(0, b.headroom)));
}

/**
 * Where a wanted value actually lands.
 *
 * `current` is what the row holds now, and it matters: the fund cap is relative
 * to it, because the funds bound the CHANGE rather than the value. A row already
 * holding 1,50 out of a spent pool keeps its 1,50; it simply cannot grow.
 */
export function settleStake(desired: number, current: number, b: StakeBounds): number {
  const lower = lowerBound(b);
  const clamped = Math.min(Math.max(desired, lower), stakeCeiling(current, b));

  // «Початкову (автоматичну) ставку можна тільки збільшити» — the sheet's own
  // rule. Talking somebody DOWN from what their rating earned them is not a
  // decision the положення gives a head.
  const floor = b.overspent ? lower : Math.max(lower, b.formulaHundredths);
  return Math.max(clamped, floor);
}
