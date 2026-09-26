import { describe, expect, it } from 'vitest';
import { planTarget } from './target';

const target = (rateHundredths: number | null, plannedHundredths = 0, doneHundredths = 0) =>
  planTarget({ minHoursPerRate: 500, rateHundredths, plannedHundredths, doneHundredths });

describe('planTarget', () => {
  it('is 500 годин on a full ставка', () => {
    expect(target(100).targetHundredths).toBe(50000);
  });

  it('is proportional below a full ставка — наказ п.3', () => {
    expect(target(25).targetHundredths).toBe(12500); // 0,25 → 125 год
    expect(target(75).targetHundredths).toBe(37500); // 0,75 → 375 год
  });

  it('splits a сумісник across two кафедри to 500 in total', () => {
    const primary = target(75).targetHundredths!;
    const additional = target(25).targetHundredths!;
    expect(primary + additional).toBe(50000);
  });

  it('has NO target when the розподіл has not reached this кафедра', () => {
    const t = target(null);
    expect(t.targetHundredths).toBeNull();
    expect(t.shortfallHundredths).toBeNull();
  });

  it('still counts planned hours with no target', () => {
    expect(target(null, 34000).plannedHundredths).toBe(34000);
  });

  it('reports the shortfall and never a negative one', () => {
    expect(target(100, 34000).shortfallHundredths).toBe(16000);
    expect(target(100, 52000).shortfallHundredths).toBe(0);
  });

  it('stays in integers — a third of a ставка does not produce a float', () => {
    const t = target(35, 0);
    expect(Number.isInteger(t.targetHundredths)).toBe(true);
    expect(t.targetHundredths).toBe(17500); // 0,35 × 500 = 175 год
  });
});

describe('план and факт against one ціль', () => {
  it('measures each against the same target, separately', () => {
    const t = target(100, 50000, 20000);
    expect(t.targetHundredths).toBe(50000);
    expect(t.shortfallHundredths).toBe(0);
    expect(t.doneHundredths).toBe(20000);
    expect(t.doneShortfallHundredths).toBe(30000);
  });

  it('has no факт shortfall when there is no target at all', () => {
    const t = target(null, 0, 12000);
    expect(t.doneShortfallHundredths).toBeNull();
    expect(t.doneHundredths).toBe(12000);
  });

  it('never reports a negative shortfall — doing more than planned is not a debt', () => {
    expect(target(100, 50000, 60000).doneShortfallHundredths).toBe(0);
  });

  it('counts факт even where nothing was planned', () => {
    // Ordinary: somebody plans two articles and publishes one article and a
    // monograph. The monograph fulfils no row and still counts.
    const t = target(100, 0, 20000);
    expect(t.doneHundredths).toBe(20000);
    expect(t.doneShortfallHundredths).toBe(30000);
  });
});

describe('D37 — somebody owes what they planned', () => {
  it('owes the plan when the plan is above the norm', () => {
    const t = target(100, 70000, 50000); // plan 700, did 500
    expect(t.doneTargetHundredths).toBe(70000);
    expect(t.doneShortfallHundredths).toBe(20000);
  });

  it('still owes the norm when the plan is below it', () => {
    const t = target(100, 40000, 45000); // plan 400, did 450
    expect(t.doneTargetHundredths).toBe(50000);
    expect(t.doneShortfallHundredths).toBe(5000);
  });

  it('leaves the PLAN shortfall measured against the norm alone', () => {
    expect(target(100, 70000, 0).shortfallHundredths).toBe(0);
    expect(target(100, 40000, 0).shortfallHundredths).toBe(10000);
  });

  it('has no factual target without a ставка', () => {
    const t = target(null, 70000, 0);
    expect(t.doneTargetHundredths).toBeNull();
    expect(t.doneShortfallHundredths).toBeNull();
  });
});
