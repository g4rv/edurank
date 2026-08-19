'use client';

import { LICENCE_POSITIONS } from '@/lib/kharakterystyka/positions';
import type { LicencePositionLink } from '@/lib/kharakterystyka/positions';
import { cn } from '@/lib/utils';

/**
 * Which points of the Характеристика this indicator's entries close.
 *
 * The column and its validation shipped with the feature; nothing ever wrote
 * it, so all 67 indicators carried an empty list and every Характеристика read
 * «0 із 20» — which also zeroed `Кнпп` on the ставки screen (2026-08-19). This
 * is the missing half.
 *
 * **The twenty points are the law's, not ours** (постанова 1187, п.38). They do
 * not change when a template year does, which is exactly why the link lives on
 * the indicator: the rating is rewritten every year, the licence is not, and
 * this is the join between them.
 *
 * Only `position` is set here. `LicencePositionLink` also carries `group` and a
 * conditional `when`, which express «these two indicators feed one threshold
 * together» and «only rows whose тип is X count» — real cases, both of them, and
 * neither is a checkbox. They are edited as JSON until somebody needs them
 * often enough to design a control; ticking a box must not silently drop a
 * condition somebody wrote, so an existing link is preserved whole and only its
 * presence is toggled.
 */
export function LicencePositionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: LicencePositionLink[];
  onChange: (next: LicencePositionLink[]) => void;
  disabled?: boolean;
}) {
  const chosen = new Map(value.map((link) => [link.position, link]));

  function toggle(position: number) {
    if (disabled) return;
    if (chosen.has(position)) {
      onChange(value.filter((link) => link.position !== position));
    } else {
      onChange([...value, { position }].sort((a, b) => a.position - b.position));
    }
  }

  /** A link carrying more than its position — kept, and said out loud */
  const isDetailed = (link: LicencePositionLink | undefined) =>
    !!link && (link.group !== undefined || link.when !== undefined);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Зараховується до Характеристики</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.length === 0 ? 'жодної позиції' : `позицій: ${value.length}`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Записи за цим показником закриватимуть відмічені позиції ліцензійних умов. Більшість
        показників не закриває жодної — це нормально.
      </p>

      <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
        {LICENCE_POSITIONS.map((position) => {
          const link = chosen.get(position.number);
          const on = !!link;
          return (
            <label
              key={position.number}
              className={cn(
                'flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition-colors',
                on ? 'bg-muted/60' : 'hover:bg-muted/30',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(position.number)}
                className="mt-1 size-4 shrink-0 accent-foreground"
              />
              <span className="min-w-0">
                <span className="font-medium tabular-nums">{position.number}.</span>{' '}
                <span className={cn(!on && 'text-muted-foreground')}>{position.title}</span>
                {isDetailed(link) && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {link?.group && `група «${link.group}»`}
                    {link?.group && link?.when && ' · '}
                    {link?.when && `лише коли ${link.when.field} = ${link.when.in.join(', ')}`}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
