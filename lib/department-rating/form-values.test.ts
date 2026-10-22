import { describe, expect, it } from 'vitest';
import { NO_CHOICE, countsFromValues, valuesFromCounts } from './form-values';
import type { IndicatorRow } from './score';

const rows: IndicatorRow[] = [
  { id: 'h', itemNumber: '1', kind: 'HEADING', coefficient: 0, options: [], isActive: true },
  { id: 'c', itemNumber: '1.1', kind: 'COUNT', coefficient: 50, options: [], isActive: true },
  {
    id: 's',
    itemNumber: '3',
    kind: 'CHOICE',
    coefficient: 0,
    options: [
      { label: 'a', points: 10 },
      { label: 'b', points: 20 },
    ],
    isActive: true,
  },
];

describe('valuesFromCounts', () => {
  it('turns typed boxes into numbers and drops the empty ones', () => {
    expect(valuesFromCounts(rows, { c: '4', s: '1' })).toEqual({ c: 4, s: 1 });
    expect(valuesFromCounts(rows, { c: '', s: NO_CHOICE })).toEqual({});
  });

  // Counts run 1–999 (owner, 2026-10-21): an empty box is «none», and a zero is
  // the same thing typed, so it is not sent at all
  it('drops a typed zero, which means the same as an empty box', () => {
    expect(valuesFromCounts(rows, { c: '0' })).toEqual({});
  });

  it('never sends a heading', () => {
    expect(valuesFromCounts(rows, { h: '3' })).toEqual({});
  });
});

describe('countsFromValues', () => {
  it('fills every box, the unanswered ones empty', () => {
    expect(countsFromValues(rows, { c: 2 })).toEqual({ c: '2', s: NO_CHOICE });
    expect(countsFromValues(rows, { s: 0 })).toEqual({ c: '', s: '0' });
  });
});
