import { describe, expect, it } from 'vitest';
import { DEPARTMENT_INDICATORS_2026 } from './catalogue-2026';

const byItem = (itemNumber: string) =>
  DEPARTMENT_INDICATORS_2026.find((d) => d.itemNumber === itemNumber);

describe('DEPARTMENT_INDICATORS_2026', () => {
  it('holds the sheet’s 32 rows: 5 headings, 26 counts and one choice', () => {
    expect(DEPARTMENT_INDICATORS_2026).toHaveLength(32);
    const kinds = DEPARTMENT_INDICATORS_2026.map((d) => d.kind);
    expect(kinds.filter((k) => k === 'HEADING')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'COUNT')).toHaveLength(26);
    expect(kinds.filter((k) => k === 'CHOICE')).toHaveLength(1);
  });

  it('numbers every row once', () => {
    const numbers = DEPARTMENT_INDICATORS_2026.map((d) => d.itemNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('gives every count a positive coefficient', () => {
    for (const d of DEPARTMENT_INDICATORS_2026.filter((d) => d.kind === 'COUNT')) {
      expect(d.coefficient, d.itemNumber).toBeGreaterThan(0);
    }
  });

  it('prices the rows as the sheet does', () => {
    expect(byItem('1.1')?.coefficient).toBe(50);
    expect(byItem('10')?.coefficient).toBe(0.5);
    expect(byItem('12.2')?.coefficient).toBe(5);
    expect(byItem('13.2')?.coefficient).toBe(10);
  });

  it('makes item 3 a choice of three amounts', () => {
    expect(byItem('3')).toMatchObject({
      kind: 'CHOICE',
      options: [
        { label: '0-10 тис. грн.', points: 10 },
        { label: '10-20 тис. грн.', points: 20 },
        { label: 'більше 20 тис. грн.', points: 30 },
      ],
    });
  });

  it('keeps the five group headings as headings', () => {
    for (const n of ['1', '2', '6', '7', '12']) expect(byItem(n)?.kind, n).toBe('HEADING');
  });
});
