import { describe, it, expect } from 'vitest';
import {
  MIN_STAKE,
  formatBonus,
  formatStake,
  fromHundredths,
  minimumKstHundredths,
  parseStake,
  roundBonus,
  snapToStep,
  toHundredths,
} from './units';

describe('hundredths', () => {
  it('round-trips a ставка', () => {
    for (const value of [0.1, 0.35, 1, 1.35, 1.5, 2.16, 7.56]) {
      expect(fromHundredths(toHundredths(value))).toBe(value);
    }
  });

  it('absorbs float drift instead of storing it', () => {
    // 0.1 + 0.2 is 0.30000000000000004
    expect(toHundredths(0.1 + 0.2)).toBe(30);
    expect(toHundredths(7 * 0.1)).toBe(70);
  });

  it('adds without drift, which is the entire reason for integers', () => {
    const shares = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map(toHundredths);
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total).toBe(105);
    // The same sum in floats does not equal 1.05
    expect(fromHundredths(total)).toBe(1.05);
  });
});

describe('formatStake', () => {
  it('uses a decimal comma and always two places', () => {
    expect(formatStake(135)).toBe('1,35');
    expect(formatStake(10)).toBe('0,10');
    expect(formatStake(100)).toBe('1,00');
    expect(formatStake(0)).toBe('0,00');
  });
});

describe('parseStake', () => {
  it('accepts both separators', () => {
    expect(parseStake('1,35')).toBe(135);
    expect(parseStake('1.35')).toBe(135);
  });

  it('accepts a whole number and trims', () => {
    expect(parseStake('  2 ')).toBe(200);
  });

  it('returns null for an empty field, so the caller decides what that means', () => {
    expect(parseStake('')).toBeNull();
    expect(parseStake('   ')).toBeNull();
  });

  it('refuses anything that is not a plain positive number', () => {
    for (const input of ['abc', '1,2,3', '-1', '1e3', '1,', '.5', '٣']) {
      expect(parseStake(input)).toBeNull();
    }
  });
});

describe('snapToStep — the 0.05 ladder, ties down', () => {
  it('leaves a value already on the ladder alone', () => {
    for (const h of [0, 5, 10, 45, 100, 150]) expect(snapToStep(h)).toBe(h);
  });

  it('rounds to the nearer step', () => {
    // The worked examples given with the rule
    expect(snapToStep(12)).toBe(10); // 0.12 → 0.10
    expect(snapToStep(13)).toBe(15); // 0.13 → 0.15
  });

  it('sends an exact half DOWN', () => {
    // 0.125 sits exactly between 0.10 and 0.15
    expect(snapToStep(12.5)).toBe(10);
    expect(snapToStep(17.5)).toBe(15);
    // Rounding a whole кафедра up is how a pool quietly overspends
  });

  it('never returns a value off the ladder', () => {
    for (let h = 0; h <= 200; h += 0.5) {
      expect(snapToStep(h) % 5).toBe(0);
    }
  });

  it('never rounds up past the nearest step', () => {
    for (let h = 0; h <= 200; h += 0.5) {
      expect(Math.abs(snapToStep(h) - h)).toBeLessThanOrEqual(2.5);
    }
  });
});

describe('roundBonus — three decimals, not the ladder', () => {
  it('keeps a value the 0.05 ladder would erase', () => {
    // A заочний контрактний здобувач is worth about this much
    expect(roundBonus(0.004375)).toBe(0.004);
    expect(snapToStep(toHundredths(0.004375))).toBe(0);
  });

  it('rounds to three places', () => {
    expect(roundBonus(0.0952380952)).toBe(0.095);
    expect(roundBonus(0.0166666)).toBe(0.017);
  });

  it('formats with a decimal comma', () => {
    expect(formatBonus(0.0952380952)).toBe('0,095');
    expect(formatBonus(0.004375)).toBe('0,004');
  });
});

describe('minimumKstHundredths', () => {
  it('is 0.1 per person on the roster', () => {
    expect(minimumKstHundredths(10)).toBe(100); // 1.00
    expect(minimumKstHundredths(25)).toBe(250); // 2.50
    expect(minimumKstHundredths(0)).toBe(0);
  });

  it('uses the absolute floor, not the положення’s 0.5', () => {
    expect(MIN_STAKE).toBe(10);
  });

  it('makes the 2025 «Кст = 0» кафедри impossible to reproduce', () => {
    // 14 people on Психології і педагогіки дошкільної освіти, pool recorded as 0
    expect(minimumKstHundredths(14)).toBeGreaterThan(0);
  });
});
