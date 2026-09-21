import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The name cell of a clickable table row — the one cell that navigates.
 *
 * The overlay link is positioned against this CELL, never against the `<tr>`.
 * `position: relative` on a table row is not honoured everywhere (Safari ignores
 * it), and where it is ignored every row's overlay resolves against a shared
 * ancestor instead: one row's link then covers the whole table and swallows every
 * click, sending each of them to the same record. Keeping the rule in one
 * component is what stops that coming back.
 *
 * Only this cell is a link, which leaves every other cell selectable — an email
 * can be copied straight out of the list. The arrow marks which cell that is
 * without needing to be hovered; the underline and the brighter arrow then
 * confirm it on hover.
 *
 * **On hover of the CELL, not of the row** (owner, 2026-09-21). It used to be
 * `group-hover/row`, so resting the pointer over a ставка or an email underlined
 * the name several columns away — an underline that promises a click where the
 * pointer is, and there is nothing to click there. The link covers this cell and
 * nothing else, so this cell is what may claim the affordance.
 *
 * The group lives on the `<td>` here, so a caller needs nothing on its `<tr>`.
 * The row's own `hover:bg-*` still lights the whole row, which is the cue that
 * says «you are on this row» rather than «this is a link».
 */
export function RowLinkCell({
  href,
  children,
  after,
  label,
  className,
}: {
  href: string;
  children: React.ReactNode;
  /**
   * Rendered in the cell but OUTSIDE the underlined span — a badge, a pill, a
   * status mark that belongs to the row rather than to the link.
   *
   * It exists because the underline is the link's own affordance and a badge
   * wearing it is a lie: the pill is not a separate destination, and on hover
   * the rule ran under «НПП» as if it were (owner, 2026-09-21). Sitting after
   * the arrow it also stops interrupting the name, which is what the hover
   * underline is meant to mark.
   *
   * The overlay link still covers it, so following the row from the badge works
   * — it simply is not drawn as the thing you are following.
   */
  after?: React.ReactNode;
  /** Accessible name, when the visible text alone would not identify the target */
  label?: string;
  className?: string;
}) {
  return (
    <td className={cn('group/rowlink relative px-4 py-3 font-medium', className)}>
      <Link href={href} className="absolute inset-0" aria-label={label} />
      <span
        className={cn(
          'flex-wrap items-center gap-x-1.5 gap-y-1',
          // `w-full` only when there IS an `after`, so it can be pushed to the
          // far edge of the cell. Without one the span stays `inline-flex` and
          // nothing about the other callers changes.
          after ? 'flex w-full' : 'inline-flex'
        )}
      >
        <span className="inline-flex items-center gap-1.5 underline-offset-4 group-hover/rowlink:underline">
          {children}
          {/* Always visible, so which cell is the link can be read without
              hunting for it with the pointer. Muted at rest and brightening on
              row hover keeps it from shouting down a list of two hundred
              rows. */}
          <ArrowUpRight
            className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover/rowlink:text-foreground"
            aria-hidden
          />
        </span>
        {/* Hard against the cell's trailing edge, so a column of badges reads
            as a column instead of as a ragged tail behind names of every
            length (owner, 2026-09-21). */}
        {after && <span className="ml-auto flex shrink-0 items-center gap-1.5">{after}</span>}
      </span>
    </td>
  );
}
