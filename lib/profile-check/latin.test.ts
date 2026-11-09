import { describe, expect, it } from 'vitest';
import { cyrillicRuns } from './latin';

describe('cyrillicRuns', () => {
  it('marks the Cyrillic lookalike inside a Latin text', () => {
    // the «С» in ORСID is Cyrillic
    const runs = cyrillicRuns('Liudmyla (ORСID 0000-0002-9653-7560)');
    expect(runs?.filter((r) => r.cyrillic).map((r) => r.text)).toEqual(['С']);
    expect(runs?.map((r) => r.text).join('')).toBe('Liudmyla (ORСID 0000-0002-9653-7560)');
  });

  it('has nothing to point at in a wholly Latin or wholly Cyrillic text', () => {
    expect(cyrillicRuns('Iryna Kamenska')).toBeNull();
    expect(cyrillicRuns('Ірина Каменська')).toBeNull();
  });
});
