'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/aurora/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/aurora/ui/popover';
import { fieldSurface } from '@/components/aurora/ui/field-surface';
import { cn } from '@/lib/utils';

export interface IsoRange {
  from?: string;
  to?: string;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const day = (v?: string) => {
  if (!v) return undefined;
  try {
    return parseISO(v);
  } catch {
    return undefined;
  }
};

/**
 * A period, picked as one range.
 *
 * **Why this exists rather than two year fields.** «Рік початку» and «Рік
 * завершення» were two independent answers, so «2019 → 2014» saved and the
 * person was told afterwards — if at all. A range control writes its two ends
 * in order (`stepRange`), so an inverted period is not something the UI can
 * produce. The schema still refuses one, for the request that skips the UI.
 *
 * **`captionLayout="dropdown"`** because these periods reach decades back: п.20
 * asks for five years of practical work that may have started in the nineties,
 * and paging a month at a time to 1994 is not a control anybody would use.
 *
 * The value is two ISO days rather than two years. The положення asks for a
 * duration — «не менше п'яти років» — and days are what make that countable;
 * `summarizeEvidence` prints them the way the document reads them.
 */
export function DateRangeInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id?: string;
  value?: IsoRange;
  onChange: (next: IsoRange | undefined) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected: DateRange | undefined = value?.from
    ? { from: day(value.from), to: day(value.to) }
    : undefined;

  const label =
    value?.from && value?.to
      ? `${format(day(value.from)!, 'd MMM yyyy', { locale: uk })} — ${format(day(value.to)!, 'd MMM yyyy', { locale: uk })}`
      : value?.from
        ? `${format(day(value.from)!, 'd MMM yyyy', { locale: uk })} — …`
        : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          // `data-invalid`, not `aria-invalid`: the attribute is not supported on
          // an implicit button role, and the styling only needs a hook.
          data-invalid={invalid || undefined}
          className={cn(
            fieldSurface('default'),
            'flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-sm',
            'transition-all outline-none focus-visible:border-brand/55 focus-visible:ring-3',
            'focus-visible:ring-brand/25 disabled:pointer-events-none disabled:cursor-not-allowed',
            'data-invalid:border-error data-invalid:ring-3 data-invalid:ring-error/20'
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', !label && 'text-placeholder')}>
            {label ?? 'Оберіть період'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          // Both ends in one go, and the second click can never land before the
          // first — that is the whole reason this replaced two year boxes.
          selected={selected}
          onSelect={(range: DateRange | undefined) =>
            onChange(
              range?.from
                ? { from: iso(range.from), to: range.to ? iso(range.to) : undefined }
                : undefined
            )
          }
          defaultMonth={day(value?.from)}
          captionLayout="dropdown"
          startMonth={new Date(1950, 0)}
          endMonth={new Date(new Date().getFullYear() + 20, 11)}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
