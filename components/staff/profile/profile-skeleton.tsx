import { Skeleton } from '@/components/ui/skeleton';

/**
 * The record's loading shapes, kept next to the components they stand in for.
 *
 * **A skeleton's job is the FRAME, not the content.** What makes one jump is
 * not that the real card turned out shorter — it is that the frame was a
 * different page. `/staff/[id]` was showing the staff LIST skeleton (filter
 * pills over a table) while a record loaded, because the `(record)` layout
 * awaits `getStaff` and the nearest boundary above it is `staff/loading.tsx`.
 * A hundred pixels of height difference is noise beside that.
 *
 * So these copy the layout exactly where it is fixed — the band is the same
 * height for everybody, the tab bar has the same three tabs — and only
 * approximate inside the cards, where no two people match anyway.
 *
 * ## Which file uses which
 *
 * | boundary                          | shows                            |
 * | --------------------------------- | -------------------------------- |
 * | `staff/[id]/loading.tsx`          | `RecordChromeSkeleton` + a body  |
 * | a `loading.tsx` inside `(record)` | the body alone — the chrome is already on screen |
 *
 * The split matters: `[id]/loading.tsx` sits OUTSIDE the `(record)` group, so
 * it covers the layout's own await. The ones inside it run after the layout has
 * rendered, when the band and tabs are already painted — repeating them there
 * is what drew a second breadcrumb and a second header under the real ones.
 */

/** Breadcrumb, identity band and tab bar — the part that is the same for everybody. */
export function RecordChromeSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-64" />

      {/* Same box as `IdentityBand`: p-5, gap-5, a size-16 avatar, and a title
          line at `text-2xl` — so the real band lands exactly here. */}
      <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-card">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <div className="flex shrink-0 gap-2 self-start">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </div>

      {/* The tab bar only. The account controls beside it are ADMIN-only and the
          record's own tabs are НПП-only, so the row's right-hand half cannot be
          predicted without a session — and a phantom control that resolves to
          nothing is worse than one that appears. */}
      <div className="w-fit rounded-lg border bg-card p-1 shadow-xs">
        <div className="flex gap-1">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
    </>
  );
}

/** One `Card` with a title and some rows in it. */
function CardSkeleton({ rows, columns = 1 }: { rows: number; columns?: 1 | 2 }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      {/* `mb-4` and `h-4`, matching `Card`'s own uppercase title */}
      <Skeleton className="mb-4 h-4 w-40" />
      <div className={columns === 2 ? 'grid grid-cols-2 gap-x-6 gap-y-4' : 'space-y-4'}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Профіль tab's body — two columns split by meaning, as in `ProfileDetails`.
 *
 * Left is the scholar (Академічна, Наукові профілі), right is the employee
 * (Місця роботи, Керівні посади). The counts are what a typical НПП has; an
 * administrative employee has fewer and a new НПП has almost none, which no
 * fixed skeleton can cover and none needs to.
 */
export function ProfileBodySkeleton() {
  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row">
      <div className="flex w-full flex-1 flex-col gap-4">
        <CardSkeleton rows={4} columns={2} />
        <CardSkeleton rows={4} />
      </div>
      <div className="flex w-full flex-1 flex-col gap-4">
        <CardSkeleton rows={2} />
      </div>
    </div>
  );
}
