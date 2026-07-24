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
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border bg-card">
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
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}
