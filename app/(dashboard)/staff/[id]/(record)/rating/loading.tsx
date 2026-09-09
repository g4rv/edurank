import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/aurora/ui/table-skeleton';

/**
 * The Рейтинг tab: № · Показник · Джерело · Бали, with the year's total pinned
 * under the rows. `flex min-h-0 flex-1 flex-col`, as `page.tsx` has, so the card
 * takes the height left over rather than guessing at it.
 *
 * The row of its own is the year picker and the «незаповнені» switch, which the
 * tab puts on the record's toolbar through a portal. The portal host is empty
 * until the page hydrates, and at this width that group wraps to its own line
 * under the tabs — which is where this stands in for it.
 */
export default function StaffRatingLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <TableSkeleton columns={[6, 60, 18, 10]} rows={9} footer />
    </div>
  );
}
