import { Skeleton } from '@/components/ui/skeleton';

export default function ModerationLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-8 w-80" />
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 px-5 py-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
