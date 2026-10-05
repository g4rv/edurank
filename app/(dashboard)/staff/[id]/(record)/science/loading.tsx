import { RecordTabRowSkeleton } from '@/components/staff/profile/record-tab-row';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The «Наукова робота» tab while it loads — the real tab bar, then the plan's
 * header card and list as shapes. A loading file has no session, so the bar
 * draws the three tabs everybody has; the fourth appears at the end.
 */
export default function StaffScienceLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRowSkeleton />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-10 w-64 rounded-lg" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
