import { describe, expect, it } from 'vitest';
import { settleStake, stakeCeiling, type StakeBounds } from './settle';

/** An ordinary row: floor 0,10, ceiling 1,00, formula proposes 0,50 */
const bounds = (over: Partial<StakeBounds> = {}): StakeBounds => ({
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
