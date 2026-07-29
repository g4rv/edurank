import { cn } from '@/lib/utils';

/**
 * Shared table shell so every list in the app reads the same way: one card,
 * zebra rows, subtle column dividers, a consistent hover.
 *
 * The styling is applied at the <table> level with descendant selectors, so it
 * lands on a plain <tbody> and on the motion.tbody used by AnimatedTableBody
 * alike — the animated rows don't need to know about any of it.
 *
 * All neutral gray: zebra and dividers are legibility, not categorical colour,
 * so the monochrome brand rule (globals.css) still holds. Column dividers use a
 * faint border; zebra and hover step up from the card in `--muted`.
 *
 * Header cells (thead) and body cells are styled by the call site as before
 * (SortTh, plain <th>, <td>) — this only adds the shared row/column texture.
 */
export function DataTable({
  className,
  fill,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  /**
   * Fit the table to the space its parent gives it and scroll the rows inside,
   * instead of growing the page. Use on paginated lists so the pager stays on
   * screen with the table rather than 50 rows below it. The parent must be a
   * `flex min-h-0 flex-col` that is itself height-bounded.
   */
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-xl border bg-card',
        fill && 'min-h-64 flex-1 overflow-y-auto'
      )}
    >
      <table
        className={cn(
          'w-full text-sm',
          // Column dividers — a hairline between columns, none after the last
          '[&_td:not(:last-child)]:border-r [&_th:not(:last-child)]:border-r',
          '[&_td]:border-border/60 [&_th]:border-border/60',
          // Zebra — every other body row a step up from the card
          '[&_tbody_tr:nth-child(even)]:bg-muted/40',
          // Hover clearly wins over the zebra shade
          '[&_tbody_tr:hover]:bg-muted/70',
          // Scrolling inside the card would carry the labels away, so pin them.
          // The header needs its own opaque fill here — rows would otherwise
          // show through the translucent tint the call sites put on the <tr>.
          fill && 'relative [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10',
          fill && '[&_thead_th]:border-b [&_thead_th]:bg-muted',
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}
