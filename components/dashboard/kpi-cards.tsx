import { cn } from '@/lib/utils';

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  /** 0–100: draws a thin meter under the figure («мають бали» out of all НПП) */
  meter?: number;
  /** The one figure the page wants noticed — `--brand`, per «Аврора» §3 */
  accent?: boolean;
}

/**
 * The page's headline figures as four separate cards. `StatStrip` stays for the
 * screens that want one hairline-divided strip; the overview has room to give
 * each number a card, a larger size and a line of context of its own.
 */
export function KpiCards({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-4 lg:grid-cols-4', className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-card p-5 shadow-card">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'mt-2 text-4xl font-semibold tracking-tight tabular-nums',
              item.accent && 'text-brand-strong'
            )}
          >
            {item.value}
          </dd>
          {item.meter !== undefined && (
            <div className="mt-3 h-1.5 rounded-full bg-brand/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-chart-accent/60 to-chart-accent"
                style={{ width: `${Math.max(0, Math.min(100, item.meter))}%` }}
              />
            </div>
          )}
          {item.hint && <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
