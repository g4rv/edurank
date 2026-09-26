import Link from 'next/link';
import { cn } from '@/lib/utils';

// One strip with hairline dividers rather than four floating cards: the rating
// is an official form, and a summary line reads like one.

export interface Stat {
  label: string;
  value: string;
  /** Small line under the value — context, not a second value */
  hint?: string;
  /**
   * Turns the tile into the filter it describes.
   *
   * On `/science-plans` the four figures — усього, мають план, під ціллю, без
   * ставки — are exactly the four views somebody wants of the table under
   * them, and a tile that states a number while a separate control does the
   * filtering asks the same question twice. Omitted, the tile is what it always
   * was: a figure.
   */
  href?: string;
  /** This tile's filter is the one currently applied. */
  active?: boolean;
}

export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={cn(
        // `overflow-hidden`: an active tile carries a fill, and without this it
        // squares off the strip's own rounded corners.
        'grid grid-cols-2 divide-y divide-border overflow-hidden rounded-xl border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0',
        className
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          // `relative`, so a link tile's overlay has something to cover. The
          // hover and active fills sit here rather than on the link: the link
          // is the whole tile, so the pointer is over both, and keeping the
          // colour on the grid child is what makes the divider hairlines meet
          // it cleanly.
          className={cn(
            'relative px-4 py-3.5 transition-colors',
            stat.active && 'bg-brand/10',
            stat.href && !stat.active && 'hover:bg-brand/5'
          )}
        >
          <dt className={cn('text-xs text-muted-foreground', stat.active && 'text-brand-strong')}>
            {stat.label}
          </dt>
          {/* Proportional figures: these sit side by side, not in a column, and
              equal-width digits make a large number look gappy. */}
          <dd className="mt-0.5 text-2xl font-semibold tracking-tight">{stat.value}</dd>
          {stat.hint && <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>}

          {stat.href && (
            // A stretched link rather than a wrapping one: `<dl>` may hold
            // `<div>`, `<dt>` and `<dd>`, and an `<a>` in that position is
            // invalid — which a screen reader announces as a list that has lost
            // its pairs.
            <Link
              href={stat.href}
              aria-current={stat.active ? 'true' : undefined}
              className="absolute inset-0 rounded-sm focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span className="sr-only">{stat.label}</span>
            </Link>
          )}
        </div>
      ))}
    </dl>
  );
}
