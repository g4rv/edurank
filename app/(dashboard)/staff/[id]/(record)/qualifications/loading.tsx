import { RecordTabRowSkeleton } from '@/components/staff/profile/record-tab-row';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * «Підвищення кваліфікації/Стажування» while it loads — the real tab bar, then
 * the list as shapes. A loading file has no session, so the bar draws the three
 * tabs everybody has; the others appear at the end.
 */
export default function StaffQualificationsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRowSkeleton />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
