import { describe, expect, it } from 'vitest';
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  afterFailure,
  isLocked,
  lockDurationMs,
  lockedMessage,
  minutesRemaining,
  type ThrottleState,
} from './throttle-policy';

const NOW = new Date('2026-08-13T10:00:00Z');
const blank: ThrottleState = { failures: 0, lockLevel: 0, lockedUntil: null };

/** Fail `times` in a row, starting from `state` */
function failTimes(state: ThrottleState, times: number, now = NOW): ThrottleState {
  let next = state;
  for (let i = 0; i < times; i++) next = afterFailure(next, now);
  return next;
}

describe('afterFailure — counting up to a lock', () => {
  it('counts failures without locking below the limit', () => {
    const state = failTimes(blank, MAX_FAILURES - 1);
    expect(state.failures).toBe(MAX_FAILURES - 1);
    expect(state.lockedUntil).toBeNull();
  });

  it('locks on the limit', () => {
    const state = failTimes(blank, MAX_FAILURES);
    expect(state.lockedUntil).toEqual(new Date(NOW.getTime() + 60_000));
    expect(state.lockLevel).toBe(1);
    // The counter restarts, so the next lock needs another full run of failures
    expect(state.failures).toBe(0);
  });
});

describe('afterFailure — the escalation', () => {
  // 1 → 1 → 15 → 30 → 60 minutes. The point of the design: a person who cannot
  // remember their password gets two cheap rounds, and anybody still going
  // after twenty attempts is not typing from memory, so the third bites.
  it('follows the configured escalation, lockout by lockout', () => {
    let state = blank;
    const durations: number[] = [];

    for (let round = 0; round < LOCK_MINUTES.length; round++) {
      // Wait out the previous lock, then fail the full quota again
      const now = state.lockedUntil ?? NOW;
      state = failTimes(state, MAX_FAILURES, now);
      durations.push((state.lockedUntil!.getTime() - now.getTime()) / 60_000);
    }

    expect(durations).toEqual([...LOCK_MINUTES]);
  });

  // The half of the change that is easy to lose: raising MAX_FAILURES alone
  // would still send the second round of honest attempts to five minutes.
  it('gives two one-minute lockouts before it escalates', () => {
    expect(LOCK_MINUTES[0]).toBe(1);
    expect(LOCK_MINUTES[1]).toBe(1);
    expect(LOCK_MINUTES[2]).toBeGreaterThan(1);
  });

  it('stays at the longest lockout rather than growing without bound', () => {
    let state: ThrottleState = { failures: 0, lockLevel: 99, lockedUntil: null };
    state = failTimes(state, MAX_FAILURES);
    const minutes = (state.lockedUntil!.getTime() - NOW.getTime()) / 60_000;
    expect(minutes).toBe(LOCK_MINUTES.at(-1));
  });

  // The subtle one. An expired lock clears the FAILURE count but must not clear
  // the LEVEL — otherwise waiting out a minute resets you to a fresh minute
  // every time, and the escalation silently becomes a flat lockout.
  it('remembers the level after a lock expires', () => {
    const locked = failTimes(blank, MAX_FAILURES);
    const after = new Date(locked.lockedUntil!.getTime() + 1000);

    const next = failTimes(locked, MAX_FAILURES, after);
    expect(next.lockLevel).toBe(2);
    expect((next.lockedUntil!.getTime() - after.getTime()) / 60_000).toBe(LOCK_MINUTES[1]);
  });

  it('resets the failure count when a lock has expired', () => {
    const locked = failTimes(blank, MAX_FAILURES);
    const after = new Date(locked.lockedUntil!.getTime() + 1000);
    expect(afterFailure(locked, after).failures).toBe(1);
  });

  it('keeps counting failures while still locked', () => {
    const locked = failTimes(blank, MAX_FAILURES);
    const during = new Date(locked.lockedUntil!.getTime() - 1000);
    expect(afterFailure(locked, during).failures).toBe(1);
  });
});

describe('isLocked', () => {
  it('is false with no lock', () => {
    expect(isLocked(blank, NOW)).toBe(false);
  });

  it('is true while the lock stands', () => {
    const locked = failTimes(blank, MAX_FAILURES);
    expect(isLocked(locked, NOW)).toBe(true);
  });

  it('is false the moment it expires', () => {
    const locked = failTimes(blank, MAX_FAILURES);
    expect(isLocked(locked, locked.lockedUntil!)).toBe(false);
  });
});

describe('lockDurationMs', () => {
  it('clamps a negative level to the first step', () => {
    expect(lockDurationMs(-1)).toBe(LOCK_MINUTES[0] * 60_000);
  });
});

describe('minutesRemaining', () => {
  it('rounds up, so 90 seconds reads as 2 minutes rather than 1', () => {
    expect(minutesRemaining(new Date(NOW.getTime() + 90_000), NOW)).toBe(2);
  });

  it('never says zero — «через 0 хвилин» is not an instruction', () => {
    expect(minutesRemaining(new Date(NOW.getTime() + 1), NOW)).toBe(1);
    expect(minutesRemaining(new Date(NOW.getTime() - 60_000), NOW)).toBe(1);
  });
});

describe('lockedMessage — Ukrainian plurals', () => {
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

  it('uses the singular accusative for one', () => {
    expect(lockedMessage(at(1), NOW)).toContain('через 1 хвилину');
  });

  it('uses the paucal for 2–4', () => {
    expect(lockedMessage(at(3), NOW)).toContain('через 3 хвилини');
  });

  it('uses the genitive plural for 5 and up', () => {
    expect(lockedMessage(at(15), NOW)).toContain('через 15 хвилин');
    expect(lockedMessage(at(60), NOW)).toContain('через 60 хвилин');
  });

  // 11–14 take the genitive plural despite ending in 1–4 — the rule ordinary
  // pluralisation code gets wrong.
  it('uses the genitive plural for the teens', () => {
    expect(lockedMessage(at(11), NOW)).toContain('через 11 хвилин');
    expect(lockedMessage(at(12), NOW)).toContain('через 12 хвилин');
  });

  it('says nothing about whether the account exists', () => {
    const message = lockedMessage(at(5), NOW);
    expect(message).not.toMatch(/акаунт|обліков|пошт|email/i);
  });
});
