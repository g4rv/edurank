import { Skeleton } from '@/components/ui/skeleton';

export default function RatingTemplateLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-36" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="divide-y rounded-xl border bg-card">
          <div className="px-5 py-3">
            <Skeleton className="h-4 w-72" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="h-4 w-96" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
