import { describe, expect, it } from 'vitest';
import { poolProblem, remainingHundredths } from './pool';

describe('remainingHundredths', () => {
  it('is what nobody has taken yet', () => {
    expect(remainingHundredths(20000, 15000)).toBe(5000);
  });

  it('never goes negative — an overdrawn pool reads as empty, not as a debt', () => {
    // Only reachable if a work's evidence were edited down; that edit is itself
    // refused for this reason, and this is the belt beside the braces. A
    // negative here is exactly the bug floats produced in the old ставки
    // system: «нерозподілено −0,15».
    expect(remainingHundredths(20000, 25000)).toBe(0);
  });
});

describe('poolProblem', () => {
  it('passes a draw that fits exactly', () => {
    expect(
      poolProblem({ totalHundredths: 20000, drawnByOthers: 15000, requested: 5000 })
    ).toBeNull();
  });

  it('passes the whole pool when nobody else has drawn', () => {
    expect(poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: 20000 })).toBeNull();
  });

  it('refuses one hundredth over what is left, and says how much that is', () => {
    const problem = poolProblem({ totalHundredths: 20000, drawnByOthers: 15000, requested: 5001 });
    expect(problem).toBe('Залишилось 50 з 200 год');
  });

  it('refuses everything once the pool is spent', () => {
    expect(poolProblem({ totalHundredths: 20000, drawnByOthers: 20000, requested: 100 })).toBe(
      'Залишилось 0 з 200 год'
    );
  });

  it('refuses zero and negative hours', () => {
    expect(poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: 0 })).not.toBeNull();
    expect(
      poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: -100 })
    ).not.toBeNull();
  });

  it('refuses a fractional hundredth — hours are integers all the way down', () => {
    expect(
      poolProblem({ totalHundredths: 20000, drawnByOthers: 0, requested: 12.5 })
    ).not.toBeNull();
  });

  it('prints a fractional total the way Додаток III does — «20,83», not «20.83»', () => {
    // An article priced per page lands here: 50 г × 10 / 24 друк. арк.
    const problem = poolProblem({ totalHundredths: 2083, drawnByOthers: 0, requested: 3000 });
    expect(problem).toBe('Залишилось 20,83 з 20,83 год');
  });
});
