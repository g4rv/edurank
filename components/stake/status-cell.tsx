'use client';

import { formatBonus } from '@/lib/stake/units';
import { statusLines } from '@/lib/stake/status-bonus';
import type { AdminPosition } from '@/lib/generated/prisma/client';

/**
 * What this person's administrative position is worth — and what every other
 * position would have been worth.
 *
 * The full list is in the tooltip because the owner asked for it: «show total
 * list of all checks but those that count with checkmark». A bare «+0,02» tells
 * a завідувач the answer; the list tells them the rule, which is what they need
 * when somebody asks why their colleague's number is different.
 *
 * Nothing here is ticked by hand. `Staff.adminPosition` is already on the
 * profile and already drives the Характеристика — this reads it.
 */
export function StatusCell({
  position,
  values,
}: {
  position: AdminPosition | null;
  /** Hundredths per position, as ADMIN priced them for the year */
  values: Record<AdminPosition, number | undefined>;
}) {
  const asMap = new Map(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k as AdminPosition, v as number])
  );
  const lines = statusLines(position, asMap);
  const held = lines.find((l) => l.counts);

  const tooltip = lines
    .map((l) => `${l.counts ? '✓' : '  '} ${l.label} — ${formatBonus(l.value)}`)
    .join('\n');

  if (!held) {
    return (
      <span className="text-muted-foreground" title={tooltip}>
        —
      </span>
    );
  }

  return (
    <span title={tooltip} className="cursor-help">
      <span className="tabular-nums">+{formatBonus(held.value)}</span>
      {/* The position itself, small — «+0,02» alone makes the head look it up */}
      <span className="block text-[10px] text-muted-foreground">{shorten(held.label)}</span>
    </span>
  );
}

/**
 * The enum's labels carry every synonym the university uses («заступник декана /
 * вчений секретар / відп. секретар прийм. комісії»), which is right in a
 * settings list and far too wide for a table cell. The first alternative names
 * the post well enough to recognise; the tooltip has all of them.
 */
function shorten(label: string): string {
  return label.split(' / ')[0];
}
