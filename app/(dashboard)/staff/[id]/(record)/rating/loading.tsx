import { Skeleton } from '@/components/ui/skeleton';

export default function StaffRatingLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-9 w-44" />
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
