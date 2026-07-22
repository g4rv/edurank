import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-5 w-32" />
      </div>

      <div className="grid grid-cols-2 rounded-xl border bg-card sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="space-y-2 border-b px-4 py-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="m-4 h-56" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border bg-card">
            <div className="space-y-2 border-b px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="m-4 h-56" />
          </div>
        ))}
      </div>
    </div>
  );
}
