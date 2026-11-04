/**
 * One door for every Scholar request in this process.
 *
 * Google tolerates a human's pace and not a script's: past a few dozen quick
 * requests from one address it answers with a CAPTCHA, and keeps answering for
 * a while. So requests are spaced (`gapMs`, plus a little jitter), however many
 * people the runner is checking at once, and the moment Google refuses the gate
 * closes for `cooldownMs` — everything in that window fails fast with
 * «спробуйте пізніше» rather than making the block longer.
 *
 * A full run is therefore bound by this gate (about 2 s a person) and takes
 * several minutes. That is the price of not being blocked; the run is a
 * background job, so nobody waits for it.
 */
export interface Gate {
  /** Resolves when this caller may send; rejects nothing */
  wait(): Promise<void>;
  /** Google refused: close the gate */
  block(): void;
  /** Milliseconds left of a block, 0 when open */
  blockedFor(): number;
}

export function createGate({
  gapMs = 2000,
  jitterMs = 500,
  cooldownMs = 10 * 60 * 1000,
  now = () => Date.now(),
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
}: {
  gapMs?: number;
  jitterMs?: number;
  cooldownMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
} = {}): Gate {
  let nextSlot = 0;
  let blockedUntil = 0;

  return {
    async wait() {
      // Claim the slot synchronously, so two callers never get the same one
      const t = now();
      const slot = Math.max(t, nextSlot);
      nextSlot = slot + gapMs + Math.random() * jitterMs;
      if (slot > t) await sleep(slot - t);
    },
    block() {
      blockedUntil = now() + cooldownMs;
    },
    blockedFor() {
      return Math.max(0, blockedUntil - now());
    },
  };
}

export const scholarGate: Gate = createGate();
