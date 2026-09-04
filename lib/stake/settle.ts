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
  /**
   * This year's rating total. **Zero removes the 0,10 floor.**
   *
   * The floor exists so that nobody who works is left without a ставка, and
   * `formulaShares` has always read it that way: it skips the floor entirely
   * «for anyone with no rating», proposing 0. The grid and the server did not,
   * so the formula offered 0, the field refused to hold it, and a кафедра with
   * an inactive НПП had a row nobody could save (owner, 2026-08-18).
   */
  rating: number;
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

/**
 * The person's floor: 0,10 at the least — unless they scored nothing this year.
 *
 * A rating of zero drops it to zero. The floor is «nobody who works is left
 * without a ставка», not «everybody on the roster is paid», and the формула
 * already drew that line; this makes the field and the save agree with it.
 */
export function lowerBound(b: Pick<StakeBounds, 'minHundredths' | 'rating'>): number {
  if (b.rating <= 0) return 0;
  return Math.max(b.minHundredths, MIN_STAKE);
}

/** The person's ceiling, never under their own floor */
export function upperBound(
  b: Pick<StakeBounds, 'minHundredths' | 'maxHundredths' | 'rating'>
): number {
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

/** What `openingStake` needs about one row. `StakeRow` satisfies it. */
export interface OpeningRow {
  rating: number;
  minHundredths: number;
  maxHundredths: number;
  /** Today's formula share for this person */
  formulaHundredths: number;
  /** The formula FROZEN at the last human save, or null if never saved */
  savedFormulaHundredths: number | null;
  /** The stored ставка — or today's formula share when nothing is stored */
  proposedHundredths: number;
}

/**
 * The ставка a row OPENS on: what the grid shows before anybody touches it.
 *
 * **Why this is not inside the grid any more** (2026-08-31). It was — thirty
 * lines of `seed()` in a client component, untested, and the only place this
 * rule existed. `/stakes` could not reuse it, so that page summed the STORED
 * allocations instead and the two screens printed different «Залишок» for the
 * same кафедра: 3,75 against 2,75 on Кафедра цифрових технологій, a whole
 * ставка apart, with the проректор reading the larger one.
 *
 * They cannot drift again: both screens call this.
 *
 * The rule itself, unchanged:
 *
 * - **Open on the stored number** — the head's decision, not the formula's.
 * - **Unless it is out of range.** ADMIN lowering somebody's Макс under a number
 *   the head already agreed leaves a row the server will refuse. The screen
 *   falls back to «за формулою», which is recomputed against the NEW bounds and
 *   is therefore always saveable. The stored value is left alone until something
 *   saves (2026-08-17, reported from the screen).
 * - **Never below the frozen formula.** «Тільки збільшити» measured against the
 *   formula as it stood at the last human save — NOT today's, which moves
 *   whenever anything about the кафедра does and dragged the floor up under
 *   people nobody had touched (2026-08-27). A row nobody has saved has no frozen
 *   value, so today's is right for it: that IS their initial automatic ставка.
 * - **Except when the formula overspends the funds**, where the floor lifts to
 *   the person's own minimum, because otherwise there is no legal way back on
 *   budget at all (Кафедра географії, 2,10 proposed against a pool of 2,00).
 */
export function openingStake(row: OpeningRow, formulaOverspends: boolean): number {
  const lower = lowerBound(row);
  const upper = upperBound(row);
  const stored = row.proposedHundredths;
  const inRange = stored >= lower && stored <= upper;
  const base = inRange ? stored : row.formulaHundredths;
  const floor = formulaOverspends
    ? lower
    : Math.max(lower, row.savedFormulaHundredths ?? row.formulaHundredths);
  return Math.min(Math.max(base, floor), upper);
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
  //
  // **Never above the person's own Макс** — `Math.min` with `upperBound`, the
  // clamp `openingStake` has always ended on. A Макс cut below the формула
  // otherwise left a row with no legal value at all: the cap refused everything
  // above it, this floor everything below the формула. The bounds win, which is
  // the rule `liftStoredAllocations` already states — «your own bounds may move
  // your ставка, the формула may not» (Гірко, 0,90 against a 0,25 cap,
  // 2026-09-04).
  const floor = b.overspent ? lower : Math.min(Math.max(lower, b.formulaHundredths), upperBound(b));
  return Math.max(clamped, floor);
}
