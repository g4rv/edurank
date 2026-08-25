import { describe, expect, it } from 'vitest';
import { fundSplit, poolTotals, type PoolRow } from './pool-totals';

/**
 * One кафедра. `remaining` defaults to the arithmetic the query does.
 *
 * `in` rather than `??` on every field: `kstHundredths: null` is the case half
 * these tests are about, and `?? 200` silently turned it into a funded кафедра.
 */
function row(partial: Partial<PoolRow>): PoolRow {
  const kstHundredths = 'kstHundredths' in partial ? partial.kstHundredths! : 200;
  const bonusPoolHundredths =
    'bonusPoolHundredths' in partial ? partial.bonusPoolHundredths! : null;
  const distributedHundredths = partial.distributedHundredths ?? 0;
  return {
    kstHundredths,
    bonusPoolHundredths,
    distributedHundredths,
    remainingHundredths:
      'remainingHundredths' in partial
        ? partial.remainingHundredths!
        : kstHundredths === null
          ? null
          : kstHundredths + (bonusPoolHundredths ?? 0) - distributedHundredths,
  };
}

describe('poolTotals', () => {
  it('adds both funds and what is left of each', () => {
    const t = poolTotals([
      row({ kstHundredths: 200, bonusPoolHundredths: 50, distributedHundredths: 150 }),
      row({ kstHundredths: 300, bonusPoolHundredths: 100, distributedHundredths: 300 }),
    ]);

    expect(t.departments).toBe(2);
    expect(t.base).toEqual({ total: 500, distributed: 450, left: 50 });
    expect(t.bonus).toEqual({ total: 150, distributed: 0, left: 150 });
    expect(t.unfunded).toBe(0);
    expect(t.overspent).toEqual({ departments: 0, hundredths: 0 });
  });

  // The rule `distribution-grid` has used per кафедра since 2026-08-17. A person
  // has one ставка, not two, so spending is attributed rather than recorded.
  it('fills the main fund first and only then the bonus fund', () => {
    const t = poolTotals([
      row({ kstHundredths: 200, bonusPoolHundredths: 100, distributedHundredths: 250 }),
    ]);

    expect(t.base).toEqual({ total: 200, distributed: 200, left: 0 });
    expect(t.bonus).toEqual({ total: 100, distributed: 50, left: 50 });
  });

  it('counts an overspend and how big it is, as a positive number', () => {
    const t = poolTotals([
      row({ kstHundredths: 200, bonusPoolHundredths: 50, distributedHundredths: 300 }), // −50
      row({ kstHundredths: 100, bonusPoolHundredths: null, distributedHundredths: 130 }), // −30
      row({ kstHundredths: 400, bonusPoolHundredths: null, distributedHundredths: 100 }),
    ]);

    expect(t.overspent).toEqual({ departments: 2, hundredths: 80 });
    // Neither fund absorbs it: the bonus fund reports the 50 it actually holds
    // as spent, and the 80 that fits nowhere is the overspend above.
    expect(t.bonus).toEqual({ total: 50, distributed: 50, left: 0 });
  });

  // The trap this function exists to avoid. 29 кафедри have no `Кст` today; if
  // one of them somehow carries an allocation, «main fills first» would put the
  // whole of it against the bonus fund, which nobody allocated either.
  it('leaves a кафедра with no Кст out of both funds', () => {
    const t = poolTotals([
      row({ kstHundredths: null, bonusPoolHundredths: null, distributedHundredths: 75 }),
      row({ kstHundredths: 200, bonusPoolHundredths: 50, distributedHundredths: 100 }),
    ]);

    expect(t.unfunded).toBe(1);
    expect(t.base).toEqual({ total: 200, distributed: 100, left: 100 });
    expect(t.bonus).toEqual({ total: 50, distributed: 0, left: 50 });
    // …and it is not an overspend either: `remaining` is null, not negative.
    expect(t.overspent.departments).toBe(0);
  });

  it('is all zeroes for an empty scope', () => {
    const t = poolTotals([]);
    expect(t).toEqual({
      departments: 0,
      base: { total: 0, distributed: 0, left: 0 },
      bonus: { total: 0, distributed: 0, left: 0 },
      overspent: { departments: 0, hundredths: 0 },
      unfunded: 0,
    });
  });

  // Integer hundredths throughout — the reason the model is not floats. Three
  // кафедри at 0,05 must be exactly 0,15 and never 0.15000000000000002.
  it('stays exact where floats would drift', () => {
    const t = poolTotals([
      row({ kstHundredths: 5, bonusPoolHundredths: null, distributedHundredths: 0 }),
      row({ kstHundredths: 5, bonusPoolHundredths: null, distributedHundredths: 0 }),
      row({ kstHundredths: 5, bonusPoolHundredths: null, distributedHundredths: 0 }),
    ]);
    expect(t.base.total).toBe(15);
  });
});

// The screen this rule came from (owner, 2026-08-25). Кафедра здоров'я: `Кст`
// 1,10, bonus fund 0,50, and 6,90 handed out. Before the cap, the bar read
// «Бонусний фонд · усього 0,50 · розподілено 5,80 · залишок −5,30», which names
// money nobody allocated and shows a fund overdrawn elevenfold.
describe('an overspend never lands on a fund', () => {
  it('caps the bonus fund at its own size', () => {
    const t = poolTotals([
      row({ kstHundredths: 110, bonusPoolHundredths: 50, distributedHundredths: 690 }),
    ]);

    expect(t.base).toEqual({ total: 110, distributed: 110, left: 0 });
    expect(t.bonus).toEqual({ total: 50, distributed: 50, left: 0 });
    expect(t.overspent).toEqual({ departments: 1, hundredths: 530 });
  });

  it('reports the whole excess when there is no bonus fund at all', () => {
    const t = poolTotals([
      row({ kstHundredths: 110, bonusPoolHundredths: 0, distributedHundredths: 690 }),
    ]);

    expect(t.base).toEqual({ total: 110, distributed: 110, left: 0 });
    expect(t.bonus).toEqual({ total: 0, distributed: 0, left: 0 });
    expect(t.overspent).toEqual({ departments: 1, hundredths: 580 });
  });

  it('never reports a negative залишок on either fund', () => {
    const t = poolTotals([
      row({ kstHundredths: 110, bonusPoolHundredths: 50, distributedHundredths: 690 }),
      row({ kstHundredths: 200, bonusPoolHundredths: null, distributedHundredths: 400 }),
      row({ kstHundredths: 300, bonusPoolHundredths: 100, distributedHundredths: 50 }),
    ]);

    expect(t.base.left).toBeGreaterThanOrEqual(0);
    expect(t.bonus.left).toBeGreaterThanOrEqual(0);
  });
});

describe('fundSplit', () => {
  it('takes it all from the main fund when it fits', () => {
    expect(fundSplit(200, 100, 150)).toEqual({ fromBase: 150, fromBonus: 0, over: 0 });
  });

  // The bonus fund COMPENSATES the main one, never the reverse.
  it('reaches the bonus fund only for what the main fund cannot hold', () => {
    expect(fundSplit(200, 100, 250)).toEqual({ fromBase: 200, fromBonus: 50, over: 0 });
  });

  it('empties both funds before anything is an overspend', () => {
    expect(fundSplit(200, 100, 300)).toEqual({ fromBase: 200, fromBonus: 100, over: 0 });
  });

  // The bug, exactly as it appeared on кафедра здоров'я: `Кст` 1,10, no bonus
  // fund, 1,30 handed out — reported as «Бонусний фонд 0,00 · залишок −0,20».
  it('never overdraws a bonus fund that holds nothing', () => {
    expect(fundSplit(110, 0, 130)).toEqual({ fromBase: 110, fromBonus: 0, over: 20 });
  });

  it('never overdraws a bonus fund that holds something', () => {
    expect(fundSplit(110, 50, 690)).toEqual({ fromBase: 110, fromBonus: 50, over: 530 });
  });

  it('is all zeroes when nothing has been handed out', () => {
    expect(fundSplit(200, 100, 0)).toEqual({ fromBase: 0, fromBonus: 0, over: 0 });
  });

  // Whatever the split, the three parts must add back up to what was handed out
  // — otherwise a ставка disappears from one card without appearing on another.
  it('always accounts for every hundredth handed out', () => {
    for (const [kst, bonus, distributed] of [
      [200, 100, 0],
      [200, 100, 150],
      [200, 100, 250],
      [200, 100, 400],
      [0, 0, 75],
      [110, 0, 130],
    ]) {
      const { fromBase, fromBonus, over } = fundSplit(kst, bonus, distributed);
      expect(fromBase + fromBonus + over).toBe(distributed);
      expect(fromBase).toBeLessThanOrEqual(kst);
      expect(fromBonus).toBeLessThanOrEqual(bonus);
      expect(over).toBeGreaterThanOrEqual(0);
    }
  });
});
