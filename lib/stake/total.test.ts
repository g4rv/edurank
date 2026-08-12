import { describe, expect, it } from 'vitest';
import { payableStake } from './total';

describe('payableStake', () => {
  it('pays the whole bonus when it fits under the ceiling', () => {
    expect(payableStake(75, 0.142, 100)).toEqual({
      total: 0.892,
      paidBonus: 0.142,
      overflow: 0,
    });
  });

  it('lands exactly on the ceiling without reporting an overflow', () => {
    expect(payableStake(75, 0.25, 100)).toEqual({ total: 1, paidBonus: 0.25, overflow: 0 });
  });

  // The case that started this: somebody at their Макс from the pool alone.
  // A hundred recruited students change nothing, and the column has to say so.
  it('pays nothing extra to somebody already at their ceiling', () => {
    expect(payableStake(100, 0.9, 100)).toEqual({ total: 1, paidBonus: 0, overflow: 0.9 });
  });

  it('pays only the part that fits', () => {
    expect(payableStake(90, 0.3, 100)).toEqual({ total: 1, paidBonus: 0.1, overflow: 0.2 });
  });

  it('is the plain ставка when there is no bonus', () => {
    expect(payableStake(65, 0, 100)).toEqual({ total: 0.65, paidBonus: 0, overflow: 0 });
  });

  // ADMIN can lower a cap under an allocation the head already saved. The pool
  // share is not clawed back here — the grid flags it out of range instead.
  it('never cuts into the pool share when the cap sits below it', () => {
    expect(payableStake(120, 0.05, 100)).toEqual({ total: 1.2, paidBonus: 0, overflow: 0.05 });
  });

  it('rounds to the three decimals a bonus is recorded at', () => {
    // 0.05 + a заочний контрактний здобувач, which is worth ~0.0039
    const { total } = payableStake(5, 1 / (13.5 * 4) / 4, 100);
    expect(total).toBe(0.055);
  });
});
