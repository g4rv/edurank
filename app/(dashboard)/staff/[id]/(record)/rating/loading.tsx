import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/aurora/ui/table-skeleton';

/**
 * The Рейтинг tab: № · Показник · Джерело · Бали, with the year's total pinned
 * under the rows. The chrome above is the layout's and is already painted.
 *
 * The one row of its own is the year picker and the «незаповнені» switch, which
 * this tab puts on the record's toolbar through a portal — the portal host is
 * empty until the page hydrates, so it is drawn here to hold the space.
 */
export default function StaffRatingLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <TableSkeleton columns={[6, 60, 18, 10]} rows={9} footer />
    </div>
  );
}
