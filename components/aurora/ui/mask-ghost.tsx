import { cn } from '@/lib/utils';

/**
 * The unfilled part of a fixed-shape value, drawn behind what has been typed.
 *
 * `0000-0000-0000-0000` as a placeholder is a lie the field tells once: it
 * looks like a real ORCID, so it reads as a value already in the box until you
 * click. `____-____-____-____` cannot be mistaken for one — it is visibly a
 * shape waiting to be filled, and it keeps saying so as you type, because the
 * part still to come stays on screen while the part you have typed is covered
 * by your own characters.
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
  /** The full shape, e.g. `____-____-____-____` */
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
      <span className="text-muted-foreground/55">{rest}</span>
    </span>
  );
}

/** ORCID is always four groups of four. */
export const ORCID_MASK = '____-____-____-____';

/**
 * ISBN-13, in the grouping of the example this app has always shown
 * (`978-3-16-148410-0`).
 *
 * **It is a hint about LENGTH, not a rule about grouping.** Only three things
 * are fixed in an ISBN-13: it starts 978 or 979, it is thirteen digits, and the
 * last one is a checksum. Where the hyphens fall depends on the registration
 * group and the publisher — a Ukrainian book is usually `978-966-…`, which
 * splits 3-3 rather than 3-1. So this mask is drawn and nothing is enforced:
 * the field still accepts whatever hyphenation the book itself prints, and the
 * checksum ignores separators entirely.
 */
export const ISBN_MASK = '___-_-__-______-_';
