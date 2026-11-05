import { describe, expect, it } from 'vitest';
import { RUN_COOLDOWN_MS, cooldownSecondsLeft } from './cooldown';

const T = Date.parse('2026-11-05T10:00:00.000Z');

describe('cooldownSecondsLeft', () => {
  it('is a minute right after a run ends', () => {
    expect(RUN_COOLDOWN_MS).toBe(60_000);
    expect(cooldownSecondsLeft('2026-11-05T10:00:00.000Z', T)).toBe(60);
  });

  it('counts down in whole seconds, rounding up so it never reads 0 too early', () => {
    expect(cooldownSecondsLeft('2026-11-05T10:00:00.000Z', T + 30_000)).toBe(30);
    expect(cooldownSecondsLeft('2026-11-05T10:00:00.000Z', T + 59_500)).toBe(1);
  });

  it('is over after the minute', () => {
    expect(cooldownSecondsLeft('2026-11-05T10:00:00.000Z', T + 60_000)).toBe(0);
    expect(cooldownSecondsLeft('2026-11-05T10:00:00.000Z', T + 3_600_000)).toBe(0);
  });

  it('is never more than the minute, so a clock running behind cannot promise a longer wait', () => {
    expect(cooldownSecondsLeft('2026-11-05T10:00:00.000Z', T - 600_000)).toBe(60);
  });

  it('is nothing for a run that has not ended or a date that is not one', () => {
    expect(cooldownSecondsLeft(null, T)).toBe(0);
    expect(cooldownSecondsLeft(undefined, T)).toBe(0);
    expect(cooldownSecondsLeft('not a date', T)).toBe(0);
  });

  it('takes a Date as well as text', () => {
    expect(cooldownSecondsLeft(new Date(T), T + 10_000)).toBe(50);
  });
});
