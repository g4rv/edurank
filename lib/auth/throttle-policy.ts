// The lockout rule, with no database in it.
//
// Kept pure so the escalation can be tested exhaustively without a Postgres —
// the part that is easy to get subtly wrong is the arithmetic, not the query.

/**
 * Failures allowed before a subject is locked.
 *
 * Ten, not five (owner, 2026-08-28). Five is tight for somebody who set their
 * password once, on a phone, and is now typing it on a desktop keyboard for the
 * first time — which is most of the university in the weeks after launch. The
 * lockout is there to make guessing pointless, and guessing is still pointless
 * at ten: what stops it is the escalation below, not the first threshold.
 */
export const MAX_FAILURES = 10;

/**
 * How long each successive lockout lasts, in minutes.
 *
 * Growing rather than flat (decided 2026-08-13). A flat window has to choose
 * between being kind to the person who mistyped their password and being harsh
 * to somebody grinding. This does not: the first lockouts are a minute, which
 * an honest user barely notices, and the last is an hour, which makes guessing
 * pointless. Past the end of the list it stays at the last value.
 *
 * TWO minutes-long lockouts, then it bites (owner, 2026-08-28). The shape is
 * deliberately not a smooth ramp: somebody who genuinely cannot remember their
 * password burns twenty honest attempts and pays a minute each time, and
 * anybody still going after that is not typing from memory. So the third
 * lockout jumps straight to a quarter of an hour rather than easing in at five.
 *
 * Net effect against guessing is stricter than the old 5/[1,5,15,60], not
 * looser, despite twice the attempts per round: reaching the same total of
 * wasted guesses now costs 17 minutes of waiting instead of 6.
 */
export const LOCK_MINUTES = [1, 1, 15, 30, 60] as const;

export interface ThrottleState {
  failures: number;
  lockLevel: number;
  lockedUntil: Date | null;
}

/** Is this subject locked right now? */
export function isLocked(state: ThrottleState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

/** How long a lockout at this level lasts */
export function lockDurationMs(lockLevel: number): number {
  const index = Math.min(Math.max(lockLevel, 0), LOCK_MINUTES.length - 1);
  return LOCK_MINUTES[index] * 60_000;
}

/**
 * The state after one more failure.
 *
 * An expired lockout resets the failure count but NOT the level: somebody who
 * waits out a minute and immediately fails five more times gets five minutes,
 * not another one. Forgetting that is how an escalating lockout quietly becomes
 * a flat one.
 */
export function afterFailure(state: ThrottleState, now: Date): ThrottleState {
  const expired = state.lockedUntil !== null && state.lockedUntil <= now;
  const failures = (expired ? 0 : state.failures) + 1;

  if (failures < MAX_FAILURES) {
    return {
      failures,
      lockLevel: state.lockLevel,
      // Clearing the expired stamp matters more than it looks. Left in place it
      // reads as «expired» on every subsequent failure, so the count resets to
      // one each time and the subject can never be locked again — the throttle
      // would protect exactly one round and then stop.
      lockedUntil: expired ? null : state.lockedUntil,
    };
  }

  return {
    failures: 0,
    lockLevel: state.lockLevel + 1,
    lockedUntil: new Date(now.getTime() + lockDurationMs(state.lockLevel)),
  };
}

/** Whole minutes left, rounded up — «спробуйте через 2 хвилини» */
export function minutesRemaining(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

/**
 * «Забагато спроб входу. Спробуйте ще раз через 5 хвилин.»
 *
 * Ukrainian needs three plural forms and the wrong one reads as broken software
 * in a message somebody is already annoyed by.
 */
export function lockedMessage(lockedUntil: Date, now: Date): string {
  const minutes = minutesRemaining(lockedUntil, now);
  return `Забагато спроб входу. Спробуйте ще раз через ${minutes} ${pluralMinutes(minutes)}.`;
}

function pluralMinutes(count: number): string {
  const last = count % 10;
  const teens = count % 100;
  if (teens >= 11 && teens <= 14) return 'хвилин';
  if (last === 1) return 'хвилину';
  if (last >= 2 && last <= 4) return 'хвилини';
  return 'хвилин';
}
