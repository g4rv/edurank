import { Skeleton } from '@/components/ui/skeleton';

export default function AchievementsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <Skeleton className="mb-3 h-4 w-48" />
            <Skeleton className="mb-2 h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
