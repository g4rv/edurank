import { Skeleton } from '@/components/ui/skeleton';

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StaffDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-20" />

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-4">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={4} />
          <CardSkeleton rows={3} />
        </div>
        <div className="flex flex-1 flex-col gap-4">
          <CardSkeleton rows={2} />
          <CardSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}
