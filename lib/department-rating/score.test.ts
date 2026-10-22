import { describe, expect, it } from 'vitest';
import { indicatorScore, reportTotal, valuesProblem, type IndicatorRow } from './score';

const row = (over: Partial<IndicatorRow> & Pick<IndicatorRow, 'id' | 'kind'>): IndicatorRow => ({
  itemNumber: over.id,
  coefficient: 0,
  options: [],
  isActive: true,
  ...over,
});

const horizon = row({ id: '1.1', kind: 'COUNT', coefficient: 50 });
const services = row({
  id: '3',
  kind: 'CHOICE',
  options: [
    { label: '0-10 тис. грн.', points: 10 },
    { label: '10-20 тис. грн.', points: 20 },
    { label: 'більше 20 тис. грн.', points: 30 },
  ],
});
const heading = row({ id: '1', kind: 'HEADING' });
const repository = row({ id: '10', kind: 'COUNT', coefficient: 0.5 });
const openAccess = row({ id: '7.3', kind: 'COUNT', coefficient: 1 });

describe('indicatorScore', () => {
  it('multiplies a count by its coefficient', () => {
    expect(indicatorScore(horizon, 3)).toBe(150);
  });

  it('pays a choice its option’s points', () => {
    expect(indicatorScore(services, 1)).toBe(20);
  });

  it('scores nothing for a line left empty', () => {
    expect(indicatorScore(horizon, undefined)).toBe(0);
    expect(indicatorScore(services, undefined)).toBe(0);
  });

  it('never scores a heading', () => {
    expect(indicatorScore(heading, 5)).toBe(0);
  });
});

describe('reportTotal', () => {
  it('adds the lines up, rounded to two decimals', () => {
    expect(reportTotal([repository, openAccess], { '10': 3, '7.3': 1 })).toBe(2.5);
    expect(reportTotal([repository], { '10': 7 })).toBe(3.5);
  });

  it('ignores a line switched off', () => {
    const off = { ...horizon, isActive: false };
    expect(reportTotal([off, openAccess], { '1.1': 2, '7.3': 4 })).toBe(4);
  });

  it('counts a choice and a count together', () => {
    expect(reportTotal([horizon, services], { '1.1': 1, '3': 2 })).toBe(80);
  });
});

describe('valuesProblem', () => {
  const rows = [heading, horizon, services, { ...openAccess, isActive: false }];

  it('accepts a valid set', () => {
    expect(valuesProblem(rows, { '1.1': 2, '3': 0 })).toBeNull();
    expect(valuesProblem(rows, {})).toBeNull();
  });

  it('refuses a value on a heading', () => {
    expect(valuesProblem(rows, { '1': 1 })).not.toBeNull();
  });

  it('refuses a line it does not know', () => {
    expect(valuesProblem(rows, { 'other-year': 1 })).not.toBeNull();
  });

  it('refuses a line switched off', () => {
    expect(valuesProblem(rows, { '7.3': 1 })).not.toBeNull();
  });

  it('refuses a choice with no such option', () => {
    expect(valuesProblem(rows, { '3': 3 })).not.toBeNull();
  });

  // Counts run 1–999 (owner, 2026-10-21): an empty line says «none», so a count
  // of 0 is refused — but a choice's first option is index 0 and must pass
  it('refuses a count of 0', () => {
    expect(valuesProblem(rows, { '1.1': 0 })).not.toBeNull();
  });

  it('accepts a choice’s first option, stored as 0', () => {
    expect(valuesProblem(rows, { '3': 0 })).toBeNull();
  });
});
