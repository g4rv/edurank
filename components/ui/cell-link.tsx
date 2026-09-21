import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A link to another record from INSIDE a table cell — a факультет on a кафедра's
 * row, a завідувач, a декан.
 *
 * **The same drawing as `RowLinkCell` and `department-pools`**: the text, a
 * small `↗` after it, and the underline arriving on hover. What differs is the
 * mechanism, and that is why this is its own component rather than a prop on
 * `RowLinkCell` — that one covers its whole `<td>` with an absolutely
 * positioned overlay, because the cell IS the row's destination. Here the cell
 * holds a value that happens to be navigable, so only the text is the target
 * and the rest of the cell stays selectable.
 *
 * **The arrow is what lets the underline wait for the hover.** §3 of
 * `docs/aurora.md` says an internal link is ink and underlined, written for a
 * link among prose. A table column is the other shape: `/departments` points
 * fifty-four rows at twelve факультети, and a permanent rule under every one of
 * them is the link farm §3 refuses, built out of underlines instead of blue.
 * The `↗` says «this opens something» at rest without drawing a line, which is
 * the trade `RowLinkCell` already made for the name column.
 *
 * `--muted-foreground/70` on the arrow and ink on hover, so a column of two
 * hundred of them stays quiet until the pointer picks one out.
 */
export function CellLink({
  href,
  children,
  label,
  className,
}: {
  href: string;
  children: React.ReactNode;
  /** Accessible name, when the visible text alone would not identify the target */
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        // **`inline-flex`, the same as `RowLinkCell`'s span, and for the reason
        // that component already found.** Drawn inline with a `&nbsp;` before
        // it, the arrow broke to a line of its own under every wrapped
        // факультет and завідувач (owner, 2026-09-21) — a non-breaking space
        // does not glue a text node to the atomic inline box after it.
        //
        // As a flex row the text is one item that wraps inside the cell and the
        // arrow is another that cannot, so it lands at the end of the last line
        // — and `items-center` puts it on the block's centre line, which is
        // where the name column has always put it.
        'group/celllink inline-flex items-center gap-1.5 underline-offset-4 hover:underline',
        className
      )}
    >
      {children}
      <ArrowUpRight
        className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover/celllink:text-foreground"
        aria-hidden
      />
    </Link>
  );
}
