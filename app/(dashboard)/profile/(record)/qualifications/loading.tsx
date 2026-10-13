import { ProfileTabRowSkeleton } from '@/components/staff/profile/profile-tab-row';
import { Skeleton } from '@/components/ui/skeleton';

/** «Підвищення кваліфікації/Стажування» while it loads — the real tab bar, then the list as shapes. */
export default function MyQualificationsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRowSkeleton />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
