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
 * confirm it on hover of the whole row, so the cue is there wherever the pointer
 * sits. Both hover states need `group/row` on the `<tr>`.
 */
export function RowLinkCell({
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
    <td className={cn('relative px-4 py-3 font-medium', className)}>
      <Link href={href} className="absolute inset-0" aria-label={label} />
      <span className="inline-flex items-center gap-1.5 underline-offset-4 group-hover/row:underline">
        {children}
        {/* Always visible, so which cell is the link can be read without
            hunting for it with the pointer. Muted at rest and brightening on row
            hover keeps it from shouting down a list of two hundred rows. */}
        <ArrowUpRight
          className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover/row:text-foreground"
          aria-hidden
        />
      </span>
    </td>
  );
}
