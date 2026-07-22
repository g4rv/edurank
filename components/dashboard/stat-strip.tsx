import { cn } from '@/lib/utils';

// One strip with hairline dividers rather than four floating cards: the rating
// is an official form, and a summary line reads like one.

export interface Stat {
  label: string;
  value: string;
  /** Small line under the value — context, not a second value */
  hint?: string;
}

export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 divide-y divide-border rounded-xl border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0',
        className
      )}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="px-4 py-3.5">
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          {/* Proportional figures: these sit side by side, not in a column, and
              equal-width digits make a large number look gappy. */}
          <dd className="mt-0.5 text-2xl font-semibold tracking-tight">{stat.value}</dd>
          {stat.hint && <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
