import { describe, expect, it } from 'vitest';
import { KYIV, kyivDayBounds } from './kyiv-time';

// The server runs on UTC; the university does not (owner, 2026-10-07)
describe('Kyiv time', () => {
  it('prints an instant as Kyiv reads it', () => {
    const at = new Date('2026-10-06T22:38:15Z');
    expect(at.toLocaleString('uk-UA', KYIV)).toContain('07.10.2026');
    expect(at.toLocaleString('uk-UA', KYIV)).toContain('01:38:15');
  });

  it('gives a summer day as 21:00 UTC to 21:00 UTC (+3)', () => {
    const { start, end } = kyivDayBounds('2026-10-07');
    expect(start.toISOString()).toBe('2026-10-06T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-07T20:59:59.999Z');
  });

  it('gives a winter day at +2', () => {
    expect(kyivDayBounds('2026-12-01').start.toISOString()).toBe('2026-11-30T22:00:00.000Z');
  });

  it('gives the day the clocks go back its 25 hours', () => {
    const { start, end } = kyivDayBounds('2026-10-25');
    expect((end.getTime() + 1 - start.getTime()) / 3_600_000).toBe(25);
  });
});
