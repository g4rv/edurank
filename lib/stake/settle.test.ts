import { describe, expect, it } from 'vitest';
import { openingStake, settleStake, stakeCeiling, type StakeBounds } from './settle';

/** An ordinary row: has a rating, floor 0,10, ceiling 1,00, formula says 0,50 */
const bounds = (over: Partial<StakeBounds> = {}): StakeBounds => ({
  rating: 120,
  minHundredths: 10,
  maxHundredths: 100,
  formulaHundredths: 50,
  headroom: 100,
  overspent: false,
  ...over,
});

describe('stakeCeiling', () => {
  it('is the person’s Макс while the funds have room to spare', () => {
    expect(stakeCeiling(50, bounds())).toBe(100);
  });

  it('is what the funds still hold when that is the tighter bound', () => {
    // Holding 0,50 with 0,20 left — 0,70 is as far as this row goes.
    expect(stakeCeiling(50, bounds({ headroom: 20 }))).toBe(70);
  });

  // The point of the whole change: «better that 0,05 is left over than that it
  // goes to −100» (owner, 2026-08-17).
  it('snaps down to the 0,05 ladder, leaving the odd kopecks in the fund', () => {
    // 0,03 left over a freely typed Кст. Paying it would make an off-ladder
    // ставка the server refuses as «має бути кратною 0,05».
    expect(stakeCeiling(50, bounds({ headroom: 3 }))).toBe(50);
    expect(stakeCeiling(50, bounds({ headroom: 7 }))).toBe(55);
  });

  it('is the value already held when nothing is left', () => {
    expect(stakeCeiling(50, bounds({ headroom: 0 }))).toBe(50);
  });

  // An overspent кафедра must not be able to grow further, but its rows keep
  // what they hold — the cap is relative to the current value, not absolute.
  it('never drops below what the row already holds, even past the funds', () => {
    expect(stakeCeiling(80, bounds({ headroom: -30, overspent: true }))).toBe(80);
  });
});

describe('settleStake', () => {
  it('grants a raise that fits', () => {
    expect(settleStake(55, 50, bounds())).toBe(55);
  });

  it('caps a raise at what the funds still hold', () => {
    // Wants 1,00, holds 0,50, only 0,15 left → lands on 0,65 rather than
    // running «нерозподілено» to −0,35.
    expect(settleStake(100, 50, bounds({ headroom: 15 }))).toBe(65);
  });

  it('refuses to move at all when the funds are spent', () => {
    expect(settleStake(100, 50, bounds({ headroom: 0 }))).toBe(50);
  });

  it('still honours the person’s Макс when the funds are generous', () => {
    expect(settleStake(200, 50, bounds({ headroom: 500 }))).toBe(100);
  });

  // «Тільки збільшити» — the formula's share is a floor, not a suggestion.
  it('will not go below what the formula proposed', () => {
    expect(settleStake(20, 50, bounds())).toBe(50);
  });

  // А Макс lowered under the frozen формула used to leave the row with no legal
  // value at all: the cap refused everything above it and «тільки збільшити»
  // refused everything below the формула. The person's own bounds win — the
  // same rule `openingStake` has always applied (owner, 2026-09-04).
  it('never lifts a row above its own Макс to satisfy the формула', () => {
    expect(settleStake(25, 20, bounds({ maxHundredths: 25, formulaHundredths: 90 }))).toBe(25);
  });

  it('lifts that floor once the кафедра is over its funds, so it can come back down', () => {
    expect(settleStake(20, 50, bounds({ overspent: true, headroom: 0 }))).toBe(20);
  });

  // The deadlock this rule exists to avoid: кафедра географії opened at 2,10
  // proposed against a pool of 2,00 — from ladder rounding alone, with nobody
  // having touched it — and a hard «never negative» left no legal move.
  it('leaves an already-overspent row able to fall to its Мін', () => {
    const b = bounds({ overspent: true, headroom: -10 });
    expect(settleStake(0, 50, b)).toBe(10);
  });

  it('never goes below the absolute 0,10, whatever Мін says', () => {
    expect(settleStake(0, 20, bounds({ minHundredths: 0, formulaHundredths: 0 }))).toBe(10);
  });
});

// The floor means «nobody who works is left without a ставка», not «everybody
// on the roster is paid». `formulaShares` always read it that way — it proposes
// 0 for anyone with no rating and skips the floor — but the grid and the save
// clamped back up to 0,10, so the formula offered a number the field refused to
// hold (owner, 2026-08-18).
describe('an НПП who scored nothing', () => {
  const inactive = (over: Partial<StakeBounds> = {}) =>
    bounds({ rating: 0, formulaHundredths: 0, ...over });

  it('may be given zero', () => {
    expect(settleStake(0, 0, inactive())).toBe(0);
  });

  it('is not pushed up to 0,10 by their own Мін', () => {
    expect(settleStake(0, 0, inactive({ minHundredths: 50 }))).toBe(0);
  });

  it('can still be given a ставка by hand', () => {
    expect(settleStake(25, 0, inactive())).toBe(25);
  });

  it('can be taken back down to zero again', () => {
    expect(settleStake(0, 25, inactive())).toBe(0);
  });

  // Everybody else is untouched: the exception is the rating, not the кафедра.
  it('leaves a colleague who scored on the 0,10 floor', () => {
    expect(settleStake(0, 20, bounds({ rating: 1, formulaHundredths: 0 }))).toBe(10);
  });
});

describe('openingStake — what a row shows before anybody touches it', () => {
  // Extracted from the grid's `seed()` on 2026-08-31 so `/stakes` could call the
  // same rule. It had no tests at all while it lived in the component: it was
  // reachable only by rendering the grid and looking.
  const row = {
    rating: 100,
    minHundredths: 10,
    maxHundredths: 100,
    formulaHundredths: 50,
    savedFormulaHundredths: null as number | null,
    proposedHundredths: 50,
  };

  it('opens on the stored number, not the formula', () => {
    // The head's decision outranks the formula's opinion of it.
    expect(openingStake({ ...row, proposedHundredths: 75 }, false)).toBe(75);
  });

  it('falls back to the formula when the stored number is above the ceiling', () => {
    // ADMIN lowered Макс under a number the head had already agreed. Opening on
    // the stored value left a row the server refuses and nobody can fix without
    // typing over it (2026-08-17).
    expect(
      openingStake(
        { ...row, proposedHundredths: 90, maxHundredths: 60, formulaHundredths: 55 },
        false
      )
    ).toBe(55);
  });

  it('falls back to the formula when the stored number is below the floor', () => {
    expect(
      openingStake(
        { ...row, proposedHundredths: 5, minHundredths: 20, formulaHundredths: 30 },
        false
      )
    ).toBe(30);
  });

  it('never opens below the formula FROZEN at the last save', () => {
    // «Тільки збільшити». A stored 40 under a frozen floor of 50 is a figure the
    // server would refuse, so the screen must not offer it.
    expect(
      openingStake({ ...row, proposedHundredths: 40, savedFormulaHundredths: 50 }, false)
    ).toBe(50);
  });

  it('measures that floor against the FROZEN formula, not today’s', () => {
    // Today's формула moved to 80 because the кафедра changed — somebody
    // archived, a сумісник added. The floor must stay where it was when a human
    // last saved, or untouched rows get dragged upward (2026-08-27).
    expect(
      openingStake(
        { ...row, proposedHundredths: 60, savedFormulaHundredths: 50, formulaHundredths: 80 },
        false
      )
    ).toBe(60);
  });

  it('uses today’s formula as the floor for a row nobody has ever saved', () => {
    // A new colleague, or a сумісник just placed here. Today's share IS their
    // initial automatic ставка, so «тільки збільшити» should hold them to it.
    expect(
      openingStake(
        { ...row, proposedHundredths: 70, savedFormulaHundredths: null, formulaHundredths: 70 },
        false
      )
    ).toBe(70);
  });

  it('lifts the floor to the person’s own minimum when the formula overspends', () => {
    // Кафедра географії: 2,10 proposed against a pool of 2,00. With a hard floor
    // there is no legal way back on budget at all.
    expect(openingStake({ ...row, proposedHundredths: 20, savedFormulaHundredths: 50 }, true)).toBe(
      20
    );
  });

  it('falls back to the formula, not to the floor, when the stored number is too low', () => {
    // Written expecting 30 — the person's own Мін — and the code returned 50.
    // The code is right: out of range means «show за формулою», and only a value
    // that is IN range is kept and clamped. Overspending lifts «тільки
    // збільшити»; it does not turn an unsaveable stored value into the floor.
    expect(openingStake({ ...row, proposedHundredths: 2, minHundredths: 30 }, true)).toBe(50);
  });

  it('keeps an in-range value below the frozen formula while overspending', () => {
    // The real point of the lift: 0,35 sits under a frozen floor of 0,50 and is
    // kept, because otherwise there is no legal way back on budget.
    expect(
      openingStake(
        { ...row, proposedHundredths: 35, minHundredths: 30, savedFormulaHundredths: 50 },
        true
      )
    ).toBe(35);
  });

  it('drops the 0,10 floor for somebody who scored nothing', () => {
    // `formulaShares` proposes 0 for them and skips the floor; the screen agrees,
    // otherwise the кафедра has a row nobody can store (owner, 2026-08-18).
    expect(
      openingStake(
        { ...row, rating: 0, proposedHundredths: 0, formulaHundredths: 0, minHundredths: 10 },
        false
      )
    ).toBe(0);
  });

  it('never exceeds the ceiling, whatever the floor says', () => {
    expect(
      openingStake(
        { ...row, proposedHundredths: 200, maxHundredths: 80, savedFormulaHundredths: 200 },
        false
      )
    ).toBe(80);
  });
});
