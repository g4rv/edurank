import { Skeleton } from '@/components/ui/skeleton';

/**
 * A value that has not arrived yet.
 *
 * **This is the only grey thing left in a loading record** (owner, 2026-09-09).
 * Everything around it — the card's title, the field's label, a table header, a
 * button's word — is static text that never depended on the query, so it is
 * printed for real while the values load.
 *
 * That replaced a page of grey boxes, and it deleted the machinery that page
 * needed: measured pixel widths for each toolbar, a row count per card, a
 * `CardSkeleton` that had to be kept the same height as the card it stood for.
 * All of it existed to GUESS a shape which, once the shell is rendered, is
 * simply the shape. Nothing left to keep in sync, and no layout shift by
 * construction — the labels are already holding the space.
 *
 * `h-5` is the `dd`'s own `text-sm` line, so a value swapping in moves nothing.
 */
export function ValueShimmer({ className }: { className?: string }) {
  return <Skeleton className={className ?? 'h-5 w-36'} />;
}
