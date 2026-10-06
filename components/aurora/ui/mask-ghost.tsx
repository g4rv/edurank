import { cn } from '@/lib/utils';

/**
 * The unfilled part of a fixed-shape value, drawn behind what has been typed.
 *
 * Unlike a `placeholder`, it keeps saying what is missing WHILE you type: the
 * part still to come stays on screen, while the part you have typed is covered
 * by your own characters.
 *
 * **Drawn in zeros, not underscores** (owner, 2026-09-08). Underscores went in
 * first, on the argument that `0000-0000-0000-0000` looks like a value already
 * in the box while `____-____-____-____` cannot be mistaken for one. That much
 * is true and it is still the wrong trade: a row of underscores reads as
 * damage. The colour is what says «not yet typed» — the character never had to.
 *
 * ## How it lines up
 *
 * The typed prefix is rendered again, INVISIBLE, so the remainder starts
 * exactly where the caret is. That is why both this and the input must be
 * `font-mono` with the same size and the same box: a proportional font would
 * put the tail a few pixels off at every keystroke.
 *
 * The input keeps its real `placeholder` attribute — assistive technology reads
 * it — and hides it with `placeholder:text-transparent`, so the hint exists
 * once for a screen reader and once on screen, never twice on screen.
 *
 * `whitespace-pre` is load-bearing: a mask is mostly repeated characters and
 * the browser would otherwise collapse runs of them.
 */
export function MaskGhost({
  template,
  typed,
  className,
}: {
  /** The full shape, e.g. `0000-0000-0000-0000` */
  template: string;
  /** What is in the field right now */
  typed: string;
  /** Padding and text size — must match the input it sits behind */
  className?: string;
}) {
  const rest = template.slice(typed.length);
  if (!rest) return null;

  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-y-0 left-0 flex items-center border border-transparent font-mono whitespace-pre',
        className
      )}
    >
      <span className="invisible">{typed}</span>
      <span className="text-mask-ghost">{rest}</span>
    </span>
  );
}

/** ORCID is always four groups of four. */
export const ORCID_MASK = '0000-0000-0000-0000';

/**
 * ISBN-13, in the grouping of the example this app has always shown
 * (`978-3-16-148410-0`). **Enforced** since 2026-10-07 (`formatIsbn`): a real
 * book may group differently (`978-966-…`), but the grouping carries no
 * meaning — the checksum and the work key both ignore separators.
 */
export const ISBN_MASK = '000-0-00-000000-0';
