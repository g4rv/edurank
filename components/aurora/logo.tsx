import { cn } from '@/lib/utils';

/**
 * The EduRank lockup — a mark plus the wordmark.
 *
 * One component because it was five copies: the sidebar and each of the four
 * auth screens spelled out their own `<span className="… font-semibold …">`,
 * which is the same drift that left `/login` and `/forgot-password` with
 * different email fields. A logo in particular has to be identical everywhere
 * or it stops being one.
 *
 * ## The mark
 *
 * Three ascending bars, because that is what this application actually is: a
 * ranking. It is also the shape already used throughout — the university's
 * circulated Word reports draw their «Рейтинг кафедр» as #4472C4 bars, and the
 * app's own charts follow them. The mark is the product's own chart, shrunk.
 *
 * **The tallest bar is gold.** `public/logo.png` — the university's crest — is
 * blue and gold, and the blue in it is the blue this app already uses. Taking
 * the gold as well ties EduRank to the institution without copying a heraldic
 * crest that turns to mud below about 64px. It also puts the eye on the top of
 * the climb, which is the point of the mark.
 *
 * (This is brand, not status. The amber that means «pending» elsewhere in the
 * app is a different colour doing a different job, and neither ever appears
 * next to the other.)
 *
 * Drawn as an SVG rather than set as a glyph so it stays crisp at 20px in the
 * rail and at 40px on the login screen, from one definition.
 */

const SIZES = {
  sm: { tile: 'size-7 rounded-[9px]', text: 'text-base', gap: 'gap-2.5' },
  lg: { tile: 'size-10 rounded-xl', text: 'text-2xl', gap: 'gap-3' },
} as const;

export function Logo({
  size = 'sm',
  className,
  /** Renders the wordmark alone — for somewhere the mark already appears */
  wordmarkOnly = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  wordmarkOnly?: boolean;
}) {
  const s = SIZES[size];

  return (
    <span className={cn('inline-flex items-center', s.gap, className)}>
      {!wordmarkOnly && (
        <span
          aria-hidden
          className={cn(
            'inline-flex shrink-0 items-center justify-center bg-[image:var(--brand-gradient)]',
            s.tile
          )}
          style={{
            // Same treatment as the primary button, so the two read as one
            // system: a brand-tinted shadow rather than a neutral one, and a
            // light hairline along the top edge.
            boxShadow:
              '0 1px 2px oklch(0.45 0.13 270 / 0.28), 0 6px 14px -6px oklch(0.5 0.15 270 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.25)',
          }}
        >
          <svg viewBox="0 0 32 32" className="size-[62%]" fill="none">
            {/* Ascending, with the shortest at 55 % white so the climb reads as
                a gradient of emphasis rather than three equal marks. */}
            <rect x="3" y="19" width="7" height="10" rx="2.6" fill="rgb(255 255 255 / 0.62)" />
            <rect x="12.5" y="12" width="7" height="17" rx="2.6" fill="rgb(255 255 255 / 0.85)" />
            <rect x="22" y="4" width="7" height="25" rx="2.6" fill="#f5c518" />
          </svg>
        </span>
      )}

      <span className={cn('font-bold tracking-[-0.02em] text-foreground', s.text)}>EduRank</span>
    </span>
  );
}
