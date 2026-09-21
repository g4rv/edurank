import { CellLink } from '@/components/ui/cell-link';
import { cn } from '@/lib/utils';

/**
 * The name cell of a table row — the cell that opens the record.
 *
 * **Only the TEXT is the link** (owner, 2026-09-21). It used to be the whole
 * cell, covered by an absolutely positioned `<Link className="absolute
 * inset-0">`, and that cost two things worth more than the bigger target:
 *
 * - **The name could not be selected or copied.** The overlay sat on top of the
 *   text and ate the drag. This component's own comment claimed the opposite
 *   benefit — «leaves every other cell selectable, an email can be copied
 *   straight out of the list» — and the one cell that was NOT selectable was
 *   the кафедра name, which is exactly what somebody pastes into a document.
 * - **Clicking blank space navigated.** «Кафедра менеджменту» is ~200px of text
 *   in a 575px cell; the remaining 375px were empty and still opened the record.
 *
 * It is also the safer construct on WebKit, not the riskier one. The overlay
 * needed `position: relative` on the cell, and it had to be on the CELL rather
 * than the `<tr>` precisely because Safari does not honour `position: relative`
 * on a table row — where it is ignored, every row's overlay resolves against a
 * shared ancestor, one row's link covers the whole table and every click goes
 * to the same record. A plain inline `<a>` has no such behaviour anywhere.
 *
 * So this is now a `<td>` wrapper around `CellLink`, which is what draws every
 * other cross-reference in a row — the факультет on a кафедра, the завідувач,
 * the декан. One link treatment per row instead of the name being the exception
 * in a row of text-only links.
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
   * Rendered in the cell but OUTSIDE the link — a badge, a pill, a status mark
   * that belongs to the row rather than to the link.
   *
   * It exists because the underline is the link's own affordance and a badge
   * wearing it is a lie: the pill is not a separate destination, and on hover
   * the rule ran under «НПП» as if it were (owner, 2026-09-21). Sitting after
   * the arrow it also stops interrupting the name.
   *
   * Now that the link is the text alone, the badge is plainly not part of it —
   * it is not covered by anything and is selectable like any other value.
   */
  after?: React.ReactNode;
  /** Accessible name, when the visible text alone would not identify the target */
  label?: string;
  className?: string;
}) {
  const link = (
    <CellLink href={href} label={label}>
      {children}
    </CellLink>
  );

  return (
    <td className={cn('px-4 py-3 font-medium', className)}>
      {after ? (
        // `w-full` so the badge can be pushed to the cell's trailing edge, and a
        // column of badges reads as a column instead of as a ragged tail behind
        // names of every length (owner, 2026-09-21).
        <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1">
          {link}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">{after}</span>
        </span>
      ) : (
        link
      )}
    </td>
  );
}
