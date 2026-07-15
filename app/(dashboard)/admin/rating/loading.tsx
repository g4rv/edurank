import { Skeleton } from '@/components/ui/skeleton';

export default function RatingAdminLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="ml-auto h-8 w-72" />
          </div>
        ))}
      </div>
    </div>
  );
}
