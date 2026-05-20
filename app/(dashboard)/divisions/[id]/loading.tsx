import { Skeleton } from '@/components/ui/skeleton';

export default function DivisionDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-20" />

      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-3 w-28" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-md" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-3 w-32" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-28 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
