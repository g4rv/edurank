import { Skeleton } from '@/components/ui/skeleton';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { StaffTableSkeleton } from '@/components/staff/staff-table-skeleton';

/**
 * The «Персонал» list — a header card over a table.
 *
 * **The same `ListHeader` the page uses**, with skeletons in its slots, so
 * nothing moves when the real one arrives. Drawing the card by hand here is how
 * the two drift: the page gained a band and a hairline, and a loose stack of
 * skeletons over the wash would have kept saying the old shape.
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
 * `departments`, `faculties` and `divisions` were moved into their own `(list)`
 * groups for the same reason on 2026-09-21. `admin/rating` still has a
 * `loading.tsx` above an `[id]`.
 */
export default function StaffLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        // Not the word «Персонал»: this boundary cannot read the query string,
        // and the archive view is titled «Архів» — a guessed heading would flash
        // the wrong one on the way to the right one.
        title={<Skeleton className="h-8 w-40" />}
        subtitle={<Skeleton className="h-4 w-24" />}
        actions={
          <>
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </>
        }
        filters={
          // Two rows, matching `StaffFilters`: the short-valued controls and
          // the switches above, the two long pickers below.
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-64 rounded-lg" />
              <Skeleton className="h-8 w-44 rounded-lg" />
              <Skeleton className="h-8 w-44 rounded-lg" />
              <Skeleton className="h-8 w-48 rounded-lg" />
              <Skeleton className="h-8 w-40 rounded-lg" />
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-60 rounded-full" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 min-w-64 flex-1 rounded-lg" />
              <Skeleton className="h-8 min-w-64 flex-1 rounded-lg" />
            </div>
          </div>
        }
      />

      <StaffTableSkeleton />
    </div>
  );
}
