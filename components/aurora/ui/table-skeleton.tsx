import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The loading shape of an «Аврора» `Table`.
 *
 * Both tab tables on a staff record are this: one card, a header strip with no
 * fill of its own, then rows separated by a hairline. What differs between the
 * rating and the Характеристика is only how wide the columns are and how tall a
 * row runs, so both are props rather than two near-identical files.
 *
 * It is deliberately NOT built on `Table` itself. That component takes real
 * `columns` and splits into three synchronised `<table>` elements to keep a
 * header and a footer pinned; a skeleton has no scrolling body to pin them
 * around, and driving it through the same machinery would make the placeholder
 * more complicated than the thing it stands in for.
 */
export function TableSkeleton({
  /** Fractions of the row width, in order — one entry per column. */
  columns,
  rows = 8,
  /** A tall row for prose (the Характеристика), a single line for figures. */
  rowHeight = 'single',
  /** A pinned total, as the rating table has under its rows. */
  footer = false,
}: {
  columns: number[];
  rows?: number;
  rowHeight?: 'single' | 'prose';
  footer?: boolean;
}) {
  const total = columns.reduce((a, b) => a + b, 0);
  const lines = rowHeight === 'prose' ? 3 : 1;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex gap-4 border-b px-4 py-3">
        {columns.map((w, i) => (
          <div key={i} style={{ width: `${(w / total) * 100}%` }}>
            <Skeleton className="h-3 w-2/3 max-w-32" />
          </div>
        ))}
      </div>

      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3">
            {columns.map((w, c) => (
              <div
                key={c}
                className="space-y-1.5"
                style={{ width: `${(w / total) * 100}%` }}
                // The first column is a number and the last a score or a state:
                // both are short, so only the prose columns get extra lines.
              >
                {Array.from({ length: c === 0 || c === columns.length - 1 ? 1 : lines }).map(
                  (_, l) => (
                    <Skeleton
                      key={l}
                      className={cn('h-3.5', l === 0 ? 'w-full' : 'w-4/5', c === 0 && 'w-8')}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {footer && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-12" />
        </div>
      )}
    </div>
  );
}
