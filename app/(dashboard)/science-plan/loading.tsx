import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

const CRUMBS = [{ label: 'Особисте' }, { label: 'Планування наукової роботи' }];

/**
 * The four real shapes below `page.tsx`'s title: the target band, the tab row,
 * the add button and the list.
 *
 * **The title is printed, not shimmered** — it never depends on the query. The
 * subtitle (the навчальний рік and the наказ) does.
 *
 * The band is drawn at its TWO-figure height (D29 shows заплановано and
 * виконано together) and the tab row at its real size, because anything here
 * that is the wrong height moves the whole page the moment the data lands —
 * the fault the staff record skeletons were pinned to the pixel to fix.
 */
export default function SciencePlanLoading() {
  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <Skeleton className="mt-1.5 h-4 w-56" />
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mt-2.5 flex gap-2">
          <Skeleton className="h-6 w-36 rounded-full" />
          <Skeleton className="h-6 w-40 rounded-full" />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The tab row's own frame, so the two tabs do not appear to grow into
            place: `p-1` around two `py-1.5 text-sm` links. */}
        <div className="flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>

      <Card padding="none">
        <ul className="divide-y">
          {[0, 1, 2].map((row) => (
            <li key={row} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-10 shrink-0" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
