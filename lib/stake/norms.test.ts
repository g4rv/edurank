import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTRACT_COEFFICIENT,
  SPECIALITY_NORMS_2026,
  normFor,
  studentValue,
} from './norms';

describe('normFor', () => {
  it('is the base itself for a бакалавр on денна', () => {
    expect(normFor(10.5, 'BACHELOR', 'FULL_TIME')).toBe(10.5);
  });

  it('halves for магістр and quadruples for заочна', () => {
    expect(normFor(10.5, 'MASTER', 'FULL_TIME')).toBe(5.25);
    expect(normFor(10.5, 'BACHELOR', 'PART_TIME')).toBe(42);
    expect(normFor(10.5, 'MASTER', 'PART_TIME')).toBe(21);
  });
});

describe('studentValue', () => {
  // The worked example the owner confirmed on 2026-08-07, base 10.5
  it('matches the confirmed worked example', () => {
    const budget = studentValue(10.5, 'BACHELOR', 'FULL_TIME', 'STATE', 0.175);
    expect(budget).toBeCloseTo(0.095, 3);

    const contract = studentValue(10.5, 'BACHELOR', 'FULL_TIME', 'CONTRACT', 0.175);
    expect(contract).toBeCloseTo(0.017, 3);
  });

  it('applies no factor of two to денна, unlike the положення', () => {
    // The положення prints Nзд / (2·Nд); the university records 1/Nд
    expect(studentValue(10, 'BACHELOR', 'FULL_TIME', 'STATE', 0.175)).toBe(0.1);
  });

  it('reproduces the multipliers measured across 1389 recorded students', () => {
    const base = 10;
    const budget = (d: 'BACHELOR' | 'MASTER', f: 'FULL_TIME' | 'PART_TIME') =>
      studentValue(base, d, f, 'STATE', 0.175) * base;

    // Expressed as a multiple of 1/base, the measured table reads:
    //               денна   заочна
    //   бакалавр     1.0     0.25
    //   магістр      2.0     0.5
    expect(budget('BACHELOR', 'FULL_TIME')).toBeCloseTo(1, 10);
    expect(budget('BACHELOR', 'PART_TIME')).toBeCloseTo(0.25, 10);
    expect(budget('MASTER', 'FULL_TIME')).toBeCloseTo(2, 10);
    expect(budget('MASTER', 'PART_TIME')).toBeCloseTo(0.5, 10);
  });

  it('applies the coefficient as a plain multiplier on the budget value', () => {
    const budget = studentValue(12.5, 'MASTER', 'PART_TIME', 'STATE', 0.175);
    const contract = studentValue(12.5, 'MASTER', 'PART_TIME', 'CONTRACT', 0.175);
    expect(contract).toBeCloseTo(budget * 0.175, 10);
  });

  it('is a per-year setting, so a different coefficient changes the answer', () => {
    const at175 = studentValue(10, 'BACHELOR', 'FULL_TIME', 'CONTRACT', 0.175);
    const at200 = studentValue(10, 'BACHELOR', 'FULL_TIME', 'CONTRACT', 0.2);
    expect(at200).toBeGreaterThan(at175);
  });

  it('returns zero rather than Infinity for a nonsense base', () => {
    // A norm of 0 would otherwise make one student worth an infinite ставка
    expect(studentValue(0, 'BACHELOR', 'FULL_TIME', 'STATE', 0.175)).toBe(0);
    expect(studentValue(-5, 'BACHELOR', 'FULL_TIME', 'STATE', 0.175)).toBe(0);
    expect(studentValue(NaN, 'BACHELOR', 'FULL_TIME', 'STATE', 0.175)).toBe(0);
  });
});

describe('SPECIALITY_NORMS_2026', () => {
  it('holds all 38 rows of додаток 5', () => {
    expect(SPECIALITY_NORMS_2026).toHaveLength(38);
  });

  it('has no duplicate names — the name is what a claim matches on', () => {
    const names = SPECIALITY_NORMS_2026.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has a positive base everywhere', () => {
    for (const [name, base] of SPECIALITY_NORMS_2026) {
      expect(base, name).toBeGreaterThan(0);
    }
  });

  it('keeps Менеджмент at 12, not the law’s 13', () => {
    const row = SPECIALITY_NORMS_2026.find(([name]) => name === 'Менеджмент');
    // Додаток 5 wins over постанова 1134. A smaller норматив makes each
    // recruited student worth more, so this is not cosmetic.
    expect(row?.[1]).toBe(12);
  });

  it('keeps the two post-2015 specialities the law has no row for', () => {
    const byName = new Map(SPECIALITY_NORMS_2026);
    expect(byName.get('Соціальна робота')).toBe(11.5);
    expect(byName.get('Публічне управління та адміністрування')).toBe(12.5);
  });
});

describe('DEFAULT_CONTRACT_COEFFICIENT', () => {
  it('is the confirmed 2026 value', () => {
    expect(DEFAULT_CONTRACT_COEFFICIENT).toBe(0.175);
  });
});
