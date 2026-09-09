import { Skeleton } from '@/components/ui/skeleton';
import { ProfileBodySkeleton } from '@/components/staff/profile/profile-skeleton';

/**
 * «Мій профіль» — the same cards as a staff record, so the same body skeleton.
 *
 * The chrome differs and is written out here rather than shared: there is no tab
 * bar (Рейтинг and Характеристика are sidebar items for an НПП, not siblings of
 * this page), and the band carries one «Редагувати» rather than edit beside
 * archive. `RecordChromeSkeleton` would draw three phantom tabs.
 */
export default function ProfileLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-48" />

      <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-card">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32 shrink-0 self-start rounded-lg" />
      </div>

      <ProfileBodySkeleton />
    </div>
  );
}
