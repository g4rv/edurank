import { Skeleton } from '@/components/ui/skeleton';
import { StaffTableSkeleton } from '@/components/staff/staff-table-skeleton';

export default function StaffLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      <Skeleton className="h-9 w-56 rounded-lg" />

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      <StaffTableSkeleton />
    </div>
  );
}
