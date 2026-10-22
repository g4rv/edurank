import { cn } from '@/lib/utils';
import { barPercent, type RankRow } from '@/lib/dashboard/ranking';

const full = new Intl.NumberFormat('uk-UA');

/**
 * A ranking as rows, not a chart: rank, the full name on a column of its own,
 * a bar, the score. A chart's category axis has to fit every name into one strip
 * beside the bars, and 31 кафедра names do not fit — they wrapped onto each
 * other. A row lets a name take two lines without touching the next one.
 *
 * `average` draws one dashed marker on every bar at the same scale. A row with
 * `second` carries two bars — a розділ and the person's total.
 */
export function RankingRows({
  rows,
  average,
  className,
}: {
  rows: RankRow[];
  average?: number;
  className?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => Math.max(r.value, r.second ?? 0)));

  return (
    <ol className={cn('divide-y divide-border', className)}>
      {rows.map((row) => {
        const top = row.rank !== null && row.rank <= 3;
        const paired = row.second !== undefined;
        return (
          <li
            key={row.key}
            className={cn(
              'grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3.5',
              'sm:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,2fr)_5rem]',
              row.empty && 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums',
                top ? 'bg-brand text-brand-foreground' : 'bg-brand/10 text-brand-strong',
                row.rank === null && 'bg-muted text-muted-foreground'
              )}
            >
              {row.rank ?? '—'}
            </span>

            <div className="min-w-0">
              <p className="text-sm leading-snug font-medium">{row.name}</p>
              {row.sub && (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{row.sub}</p>
              )}
            </div>

            <div className="text-right sm:col-start-4 sm:row-start-1">
              {row.empty ? (
                // «Pending» is --warning's job (docs/aurora.md §3): a pill, never a tinted row
                <span className="rounded-full bg-warning-surface px-2 py-0.5 text-xs whitespace-nowrap text-warning">
                  {row.note}
                </span>
              ) : (
                // Paired, the numbers stack in the bars' order — total over розділ, as in the PDF
                <>
                  {paired && (
                    <span className="block text-sm text-muted-foreground tabular-nums">
                      {full.format(Math.round(row.second ?? 0))}
                    </span>
                  )}
                  <span
                    className={cn(
                      'block font-semibold tabular-nums',
                      paired ? 'text-sm' : 'text-base'
                    )}
                  >
                    {full.format(Math.round(row.value))}
                  </span>
                </>
              )}
            </div>

            <div className="col-span-full flex flex-col gap-1 sm:col-span-1 sm:col-start-3 sm:row-start-1">
              {paired && !row.empty && (
                <Bar percent={barPercent(row.second ?? 0, max)} tone="total" thin />
              )}
              {!row.empty && (
                <Bar
                  percent={barPercent(row.value, max)}
                  marker={average === undefined ? undefined : barPercent(average, max)}
                  tone={top ? 'top' : 'plain'}
                  thin={paired}
                />
              )}
              {row.empty && <div className="h-3 rounded-full bg-muted/70" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Bar({
  percent,
  marker,
  tone,
  thin,
}: {
  percent: number;
  marker?: number;
  tone: 'plain' | 'top' | 'total';
  thin?: boolean;
}) {
  return (
    <div className={cn('relative rounded-full bg-brand/10', thin ? 'h-2.5' : 'h-3')}>
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'total' && 'bg-chart-total',
          tone === 'plain' && 'bg-gradient-to-r from-chart-accent/60 to-chart-accent',
          tone === 'top' && 'bg-gradient-to-r from-chart-accent to-brand-strong'
        )}
        style={{ width: `${percent}%` }}
      />
      {marker !== undefined && marker > 0 && marker < 100 && (
        // Dashed and foreground-coloured so it reads as «a reference», not a series
        <span
          aria-hidden
          className="absolute -inset-y-1 border-l-2 border-dashed border-foreground/40"
          style={{ left: `${marker}%` }}
        />
      )}
    </div>
  );
}
