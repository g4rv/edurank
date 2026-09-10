import { Skeleton } from '@/components/ui/skeleton';
import { StaffTableSkeleton } from '@/components/staff/staff-table-skeleton';

/**
 * The «Персонал» list — filters over a table.
 *
 * **In a `(list)` route group, and that is load-bearing** (2026-09-09). A
 * `loading.tsx` covers its own segment AND every route beneath it, so while this
 * sat at `staff/` it was also the boundary for `staff/[id]` and `staff/new` —
 * and a hard reload of one person's record streamed this skeleton, filter pills
 * over a table, alongside the record's own. Two skeletons for two different
 * pages, on screen at once, interleaved.
 *
 * A route group changes no URL: `/staff` is still `/staff`. It exists only to
 * put a boundary around the list and nothing else.
 *
 * The same trap is still open on `departments`, `faculties`, `divisions` and
 * `admin/rating`, each of which has a `loading.tsx` above an `[id]`.
 */
export default function StaffLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      <Skeleton className="h-9 w-56 rounded-lg" />

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      <StaffTableSkeleton />
    </div>
  );
}
