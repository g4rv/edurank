import Link from 'next/link';
import { cn } from '@/lib/utils';

export type PlanTab = 'plan' | 'done';

/**
 * «План» / «Виконано» (D29).
 *
 * Two lists rather than records nested under the intention they fulfil. The
 * nesting reads well for somebody who did exactly what they planned and badly
 * for the ordinary case — unplanned work is normal («plans two articles and
 * publishes one article and a monograph»), and that monograph has no parent to
 * sit under. The two tabs also match how the year is actually worked: planning
 * in September, recording months later.
 *
 * The tab lives in the URL, not in client state, so it survives a refresh and
 * the Back button and the server renders only the list being looked at. Drawn
 * exactly like `DepartmentSwitcher` below it — the active one takes `--brand`,
 * which §3 gives to the active tab.
 */
export function RecordTabs({
  active,
  departmentId,
  planCount,
  doneCount,
  doneLocked = false,
}: {
  active: PlanTab;
  departmentId: string;
  planCount: number;
  doneCount: number;
  /** The plan is not submitted yet, so there is nothing to record against. */
  doneLocked?: boolean;
}) {
  const tabs: { key: PlanTab; label: string; count: number }[] = [
    { key: 'plan', label: 'План', count: planCount },
    { key: 'done', label: 'Виконано', count: doneCount },
  ];

  return (
    <div className="flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs">
      {tabs.map((tab) => {
        const isActive = tab.key === active;

        // Not a link at all while the plan is open, and it says why on hover.
        // A tab that looks live and refuses on arrival is worse than one that
        // plainly is not ready yet.
        if (tab.key === 'done' && doneLocked) {
          return (
            <span
              key={tab.key}
              aria-disabled="true"
              title="Спочатку збережіть план"
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground"
            >
              {tab.label}
            </span>
          );
        }

        return (
          <Link
            key={tab.key}
            // `?dept=` is carried, or a сумісник switching tabs would be thrown
            // back to their other кафедра.
            href={`/science-plan?dept=${departmentId}${tab.key === 'done' ? '&tab=done' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand text-brand-foreground shadow-sm'
                : 'text-foreground hover:bg-brand/10 hover:text-brand-strong'
            )}
          >
            {tab.label}
            <span
              className={cn(
                'ml-1.5 tabular-nums',
                isActive ? 'text-brand-foreground/70' : 'text-foreground-soft'
              )}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
