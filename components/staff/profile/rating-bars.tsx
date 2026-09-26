import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SECTION_TITLES } from '@/lib/rating/activity-types';

/**
 * The year's score, section by section, as bars rather than tiles.
 *
 * Six equal boxes gave every section the same weight and hid the only thing
 * worth seeing — the SHAPE of somebody's rating. A person with 3 000 points in
 * Розділ 3 and nothing in Розділ 4 looked exactly like an even spread. Bars on
 * a common baseline are the easiest comparison there is, and the shape is the
 * finding: it says where this person's work actually is, and where an НПП has
 * submitted nothing at all.
 *
 * Scaled to the largest section rather than to the total, because the question
 * is «which of these is big», not «what fraction of everything is this».
 *
 * Empty sections keep their row. Here a zero IS information — it is the gap
 * somebody has to fill — which is exactly why it is not hidden the way an empty
 * profile field is.
 */
export function RatingBars({
  year,
  sections,
  total,
  href,
  linkLabel,
}: {
  year: number;
  /** Five section scores, in order */
  sections: number[];
  total: number;
  href?: string;
  linkLabel?: string;
}) {
  const peak = Math.max(...sections, 1);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Рейтинг — {year} рік
        </h2>
        {href && linkLabel && (
          <Link
            href={href}
            className="inline-flex items-center gap-0.5 text-sm text-brand underline-offset-4 hover:underline"
          >
            {linkLabel}
            {/* This leaves the page for the full table — the chevron says so
                before the click, which a bare coloured word does not. */}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>

      <div className="space-y-2.5">
        {sections.map((score, i) => (
          <div key={i} className="flex items-center gap-3">
            <span
              className="w-24 shrink-0 text-sm text-muted-foreground"
              title={SECTION_TITLES[i + 1]}
            >
              Розділ {i + 1}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${(score / peak) * 100}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-base font-medium tabular-nums">
              {score.toLocaleString('uk-UA')}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-base font-medium">Разом</span>
        <span className="text-xl font-bold text-brand tabular-nums">
          {total.toLocaleString('uk-UA')}
        </span>
      </div>
    </div>
  );
}
