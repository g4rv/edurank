'use client';

import { formatStakeValue } from '@/lib/stake/units';
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

  // Two decimals, not three. A надбавка is a ставка on the 0,05 ladder, so
  // «+0,050» claimed a precision the field cannot even accept — `formatBonus` is
  // for the recruitment figure, where a заочний контрактний здобувач really is
  // worth 0,004.
  const tooltip = lines
    .map(
      (l) =>
        `${l.counts ? '✓' : '  '} ${l.label} — ` +
        (l.value > 0 ? formatStakeValue(l.value) : 'не оцінено')
    )
    .join('\n');

  // Nothing to show, in two cases that look the same in this column: no post at
  // all, and a post ADMIN has not priced. Neither adds anything to
  // «Рекомендовано», and this column exists to say what the надбавка is — so an
  // unpriced post shows «—» like everybody else, with no number and no title
  // (owner, 2026-08-18). It said «+0,000 Завідувач кафедри», which read as a
  // надбавка that was calculated and came out at zero.
  //
  // The post is still on the profile and still on the Характеристика; it is
  // only absent from the column about money. The tooltip keeps the whole table.
  if (!held || held.value <= 0) {
    return (
      <span
        className="cursor-help text-muted-foreground"
        title={
          held ? `${tooltip}\n\nНадбавку за посаду «${held.label}» ще не встановлено` : tooltip
        }
      >
        —
      </span>
    );
  }

  return (
    <span title={tooltip} className="cursor-help">
      <span className="tabular-nums">+{formatStakeValue(held.value)}</span>
      {/* The position itself, small — «+0,05» alone makes the head look it up */}
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
