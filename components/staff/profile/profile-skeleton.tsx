import { Skeleton } from '@/components/ui/skeleton';

/**
 * The record's loading shapes, kept next to the components they stand in for.
 *
 * **The fixed chrome is matched to the pixel; only the cards approximate.**
 * The breadcrumb and the identity band are the same height for every person
 * alive, so there is no excuse for them moving — and a header that shifts 8px
 * as the data lands is the jump a reader actually notices, far more than a card
 * being a row shorter than the placeholder guessed.
 *
 * Measured on a real record rather than reasoned about, because the first
 * attempt was reasoned about and came out 8px short:
 *
 * | part                | height | made of                                  |
 * | ------------------- | ------ | ---------------------------------------- |
 * | breadcrumb          | 20     | `text-sm`, so `h-5` and not `h-4`        |
 * | identity band       | 109    | `p-5` (40) + 69                          |
 * | · name row          | 32     | `text-2xl` line-height                    |
 * | · gap               | 12     | `mt-3` on the contacts, so `space-y-3`   |
 * | · contacts row      | 24     | a `size-6` copy button, NOT the text     |
 * | actions (self-start)| 28     | `size="sm"` buttons — `h-7`              |
 * | tab bar             | 41     | `p-1` + a `py-1.5 text-sm` link + border |
 *
 * The contacts row is the one that catches you out: the text is `text-sm` (20px)
 * but the copy button beside it is `size-6`, and the row takes the taller of
 * the two.
 *
 * ## Which file uses which
 *
 * | boundary                          | shows                                |
 * | --------------------------------- | ------------------------------------ |
 * | `staff/[id]/loading.tsx`          | all of the chrome, then a body       |
 * | a `loading.tsx` inside `(record)` | the body alone                       |
 *
 * The split matters: `[id]/loading.tsx` sits OUTSIDE the `(record)` group, so
 * it covers the layout's own await. The ones inside it run after the layout has
 * rendered, when the band and tabs are already painted — repeating them there
 * is what drew a second breadcrumb and a second header under the real ones.
 */

/** 20px, because `Breadcrumbs` is `text-sm`. */
export function BreadcrumbSkeleton() {
  return <Skeleton className="h-5 w-64" />;
}

/**
 * `IdentityBand`, to the pixel — 109px tall whoever it ends up describing.
 *
 * `actions` is a count rather than nodes: the record shows «Редагувати» beside
 * «Архівувати», «Мій профіль» shows one. Both are `size="sm"`, so both are 28px
 * and neither changes the band's height — but a right-hand side that gains a
 * second button on load is still a visible pop.
 */
export function IdentityBandSkeleton({ actions = 2 }: { actions?: 1 | 2 }) {
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-card">
      <Skeleton className="size-16 shrink-0 rounded-full" />

      {/* 32 + 12 + 24 = 68, which is what the real column measures. */}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        {/* `h-6`, not `h-5`: the row is as tall as the copy button in it. */}
        <Skeleton className="h-6 w-72 max-w-full" />
      </div>

      <div className="flex shrink-0 gap-2 self-start">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * The record's tab row.
 *
 * The bar only. The account controls beside it are ADMIN-only and the tabs
 * themselves are НПП-only, so the row's right-hand half cannot be predicted
 * without a session — and a phantom control that resolves to nothing is worse
 * than one that appears. The outer flex is copied anyway so the row wraps the
 * same way at narrow widths.
 */
export function RecordTabsSkeleton({ toolbar }: { toolbar?: number[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="w-fit rounded-lg border bg-card p-1 shadow-xs">
        <div className="flex gap-1">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
      {toolbar && <ToolbarGroupSkeleton widths={toolbar} />}
    </div>
  );
}

/**
 * The tab's own controls, in the strip they land in.
 *
 * On the row, not under it. The rating tab's placeholder used to be a pair of
 * loose blocks on a line of its own below the tabs, which is neither where the
 * controls end up nor a shape the page ever has — so the row grew a phantom
 * line and then lost it (owner, 2026-09-09).
 *
 * `widths` are the controls in order, in pixels; `ToolbarGroup`'s own `p-1`
 * around `h-8` children is what makes this the tab bar's height.
 */
export function ToolbarGroupSkeleton({ widths }: { widths: number[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-1 shadow-xs">
      {widths.map((w, i) => (
        <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
      ))}
    </div>
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
 * fixed skeleton can cover and none needs to. This is the part that is allowed
 * to be wrong — it sits below everything the reader is looking at.
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
