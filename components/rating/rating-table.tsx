import { cn } from '@/lib/utils';
import type { AchievementGroup } from '@/components/rating/achievements-list';

const STATUS_STYLES = {
  APPROVED: 'bg-primary/10 text-primary',
  PENDING: 'bg-muted text-muted-foreground',
  REMOVED: 'bg-destructive/10 text-destructive',
} as const;

/** Only APPROVED items count toward totals */
function sectionTotal(group: AchievementGroup): number {
  return group.items.filter((i) => i.status === 'APPROVED').reduce((sum, i) => sum + i.score, 0);
}

/**
 * Full read-only rating table: all 5 sections with subtotals + grand total.
 * `groups` should include every section (even empty ones) for the complete picture.
 */
export function RatingTable({ groups }: { groups: AchievementGroup[] }) {
  const grandTotal = groups.reduce((sum, g) => sum + sectionTotal(g), 0);

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const subtotal = sectionTotal(group);
        return (
          <div key={group.number} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-5 py-3">
              <h3 className="text-sm font-semibold">
                Розділ {group.number}. {group.title}
              </h3>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{subtotal}</span>
            </div>

            {group.items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Немає досягнень.</p>
            ) : (
              <ul className="divide-y">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="mr-1.5 text-muted-foreground">{item.itemNumber}</span>
                        {item.label}
                      </p>
                      {item.summary && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.summary}
                        </p>
                      )}
                      {item.status === 'REMOVED' && item.removeReason && (
                        <p className="mt-1 text-xs text-destructive">
                          Причина відхилення: {item.removeReason}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLES[item.status]
                        )}
                      >
                        {item.statusLabel}
                      </span>
                      <span
                        className={cn(
                          'w-12 text-right text-sm font-semibold tabular-nums',
                          item.status !== 'APPROVED' && 'text-muted-foreground line-through'
                        )}
                      >
                        {item.score}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-primary/30 bg-card px-5 py-4">
        <span className="text-base font-semibold">Загальна сума балів</span>
        <span className="text-lg font-bold tabular-nums">{grandTotal}</span>
      </div>
    </div>
  );
}
