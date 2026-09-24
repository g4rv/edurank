import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ToolbarGroup, ToolbarRow } from '@/components/staff/record-toolbar';

const CRUMBS = [{ label: 'Особисте' }, { label: 'Планування наукової роботи' }];

/**
 * The page's real shapes, built from its real parts: `PlanHeader`'s card (the
 * title left, the figures right), the tab bar and the action bar in the shared
 * `ToolbarRow` / `ToolbarGroup`, and the list card with its grey пункт row.
 *
 * Rebuilt 2026-09-24 when the header and toolbar changed — the old skeleton
 * still drew a bare title, a separate figures card with two pills and a loose
 * button, so the page jumped when the data landed. Anything here of the wrong
 * height moves the whole page, which is why the toolbar pieces are the shared
 * components rather than copies of their classes.
 *
 * **The title is printed, not shimmered** — it never depends on the query. The
 * subtitle (the навчальний рік and the наказ) does.
 */
export default function SciencePlanLoading() {
  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
            <Skeleton className="mt-1.5 h-4 w-72" />
          </div>
          {/* «Заплановано» and «Виконано» at their `text-lg` line height, and
              the one small status line under them. */}
          <div className="space-y-1">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-7 w-36" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
        </div>
      </Card>

      <ToolbarRow>
        {/* The tab bar's own frame, so the two tabs do not appear to grow into
            place. */}
        <div className="flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs">
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <ToolbarGroup>
          <Skeleton className="h-8 w-44 rounded-md" />
        </ToolbarGroup>
      </ToolbarRow>

      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y">
          <li className="flex items-center justify-between gap-4 bg-table-group px-5 py-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-14" />
          </li>
          {[0, 1].map((row) => (
            <li key={row} className="flex items-start justify-between gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="mt-1.5 h-4 w-2/3" />
                <Skeleton className="mt-1.5 h-4 w-28" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
