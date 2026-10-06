import { describe, expect, it } from 'vitest';
import { withoutRemovedLines } from './import-guard';

const line = { staffId: 's1', position: 1, group: null, year: 2024, text: 'Стаття' };

// A line somebody took out of their Характеристика must not come back with the
// next import run (owner, 2026-10-06).
describe('withoutRemovedLines', () => {
  it('drops an incoming row that is a removed line', () => {
    expect(withoutRemovedLines([line], [line])).toEqual({ kept: [], skipped: 1 });
  });

  it('keeps the same text for another person, year or position', () => {
    const others = [
      { ...line, staffId: 's2' },
      { ...line, year: 2023 },
      { ...line, position: 3 },
    ];
    expect(withoutRemovedLines(others, [line])).toEqual({ kept: others, skipped: 0 });
  });
});
