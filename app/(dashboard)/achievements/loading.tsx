import { Skeleton } from '@/components/ui/skeleton';

export default function MyRatingLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-8" />
            </div>
            <div className="px-5 py-4">
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}
