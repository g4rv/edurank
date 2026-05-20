import { Skeleton } from '@/components/ui/skeleton';

const ROW_WIDTHS = [
  ['w-40', 'w-44', 'w-10', 'w-36', 'w-28'],
  ['w-36', 'w-48', 'w-10', 'w-40', 'w-20'],
  ['w-44', 'w-40', 'w-12', 'w-32', 'w-32'],
  ['w-32', 'w-52', 'w-10', 'w-44', 'w-24'],
  ['w-48', 'w-44', 'w-12', 'w-36', 'w-28'],
  ['w-36', 'w-48', 'w-10', 'w-40', 'w-20'],
  ['w-40', 'w-40', 'w-12', 'w-32', 'w-32'],
  ['w-44', 'w-52', 'w-10', 'w-36', 'w-24'],
] as const;

export function StaffTableSkeleton() {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex gap-8">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="divide-y">
        {ROW_WIDTHS.map((cols, i) => (
          <div key={i} className="flex items-center gap-8 px-4 py-3.5">
            <Skeleton className={`h-4 ${cols[0]}`} />
            <Skeleton className={`h-4 ${cols[1]}`} />
            <Skeleton className={`h-5 ${cols[2]} rounded-full`} />
            <Skeleton className={`h-4 ${cols[3]}`} />
            <Skeleton className={`h-4 ${cols[4]}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
