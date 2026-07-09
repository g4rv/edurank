import { Skeleton } from '@/components/ui/skeleton';

export default function DivisionDataLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-9 w-96" />
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
