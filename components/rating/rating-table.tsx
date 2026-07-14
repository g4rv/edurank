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

const cell = 'border border-border px-3 py-2';

/**
 * Full read-only rating table, spreadsheet-style: one bordered grid with
 * section header rows, item rows, section subtotals and a grand total.
 * `groups` should include every section (even empty ones) for the complete picture.
 */
export function RatingTable({ groups }: { groups: AchievementGroup[] }) {
  const grandTotal = groups.reduce((sum, g) => sum + sectionTotal(g), 0);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60 text-left">
            <th className={cn(cell, 'w-16 font-medium text-muted-foreground')}>№</th>
            <th className={cn(cell, 'font-medium text-muted-foreground')}>Показник</th>
            <th className={cn(cell, 'w-32 font-medium text-muted-foreground')}>Статус</th>
            <th className={cn(cell, 'w-20 text-right font-medium text-muted-foreground')}>Бали</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <SectionRows key={group.number} group={group} />
          ))}
          <tr className="bg-primary/10 font-bold">
            <td colSpan={3} className={cell}>
              Загальна сума балів
            </td>
            <td className={cn(cell, 'text-right text-base tabular-nums')}>{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SectionRows({ group }: { group: AchievementGroup }) {
  const subtotal = sectionTotal(group);

  return (
    <>
      <tr className="bg-muted/40 font-semibold">
        <td colSpan={3} className={cell}>
          Розділ {group.number}. {group.title}
        </td>
        <td className={cn(cell, 'text-right tabular-nums')}>{subtotal}</td>
      </tr>

      {group.items.length === 0 ? (
        <tr>
          <td colSpan={4} className={cn(cell, 'text-muted-foreground')}>
            Немає досягнень
          </td>
        </tr>
      ) : (
        group.items.map((item) => (
          <tr key={item.id} className="transition-colors hover:bg-muted/20">
            <td className={cn(cell, 'align-top text-muted-foreground tabular-nums')}>
              {item.itemNumber}
            </td>
            <td className={cn(cell, 'align-top')}>
              <p>{item.label}</p>
              {item.summary && (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
              )}
              {item.status === 'REMOVED' && item.removeReason && (
                <p className="mt-1 text-xs text-destructive">
                  Причина відхилення: {item.removeReason}
                </p>
              )}
            </td>
            <td className={cn(cell, 'align-top')}>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                  STATUS_STYLES[item.status]
                )}
              >
                {item.statusLabel}
              </span>
            </td>
            <td
              className={cn(
                cell,
                'text-right align-top font-semibold tabular-nums',
                item.status !== 'APPROVED' && 'font-normal text-muted-foreground line-through'
              )}
            >
              {item.score}
            </td>
          </tr>
        ))
      )}
    </>
  );
}
