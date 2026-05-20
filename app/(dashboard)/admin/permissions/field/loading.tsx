import { Skeleton } from '@/components/ui/skeleton';

export default function FieldPermissionsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, g) => (
          <div key={g} className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="divide-y">
              {Array.from({ length: g === 2 ? 7 : g === 3 ? 2 : 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-5 w-9 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
