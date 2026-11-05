/**
 * The pause between two runs of the SAME platform (owner, 2026-11-05): a run
 * that has just ended cannot be followed by another for a minute. Pressing the
 * button again and again is how Google and Web of Science were made to refuse
 * us; the sites' limits are per site, so the pause is per platform and one
 * platform's run never holds another's back.
 *
 * The server enforces it (`startRun`); the page only counts it down. Shared
 * and free of server code so a client component can import it.
 */
export const RUN_COOLDOWN_MS = 60_000;

/**
 * Whole seconds left of the pause after a run that finished at `finishedAt`
 * (an ISO time, or a Date), or 0. Never more than the pause itself: a clock
 * that runs behind must not promise a longer wait than there is.
 */
export function cooldownSecondsLeft(
  finishedAt: string | Date | null | undefined,
  now: number = Date.now()
): number {
  if (!finishedAt) return 0;
  const end = new Date(finishedAt).getTime() + RUN_COOLDOWN_MS;
  if (Number.isNaN(end)) return 0;
  const left = Math.ceil((end - now) / 1000);
  return Math.min(Math.max(left, 0), RUN_COOLDOWN_MS / 1000);
}
