import { Skeleton } from '@/components/ui/skeleton';

export default function DivisionDetailLoading() {
  return (
    <div className="max-w-3xl space-y-6">
      <Skeleton className="h-4 w-20" />

      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full" />
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-5">
        <Skeleton className="h-3 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
