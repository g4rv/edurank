import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

const CRUMBS = [{ label: 'Особисте' }, { label: 'Планування наукової роботи' }];

/** The three real shapes below `page.tsx`'s title: the target band, the «План»
 *  header and the row list — nothing here depends on which кафедра or which
 *  rows the query answers with. */
export default function SciencePlanLoading() {
  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <div className="flex h-8 items-center">
        <Skeleton className="h-6 w-72 max-w-full" />
      </div>

      <Card>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-40" />
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-32" />
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
