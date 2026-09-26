'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/aurora/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/aurora/ui/popover';
import { stepRange, type RangeEnd } from '@/lib/forms/date-range';
import { fieldSurface } from '@/components/aurora/ui/field-surface';
import { cn } from '@/lib/utils';
import { RANGE_MAX_YEAR, RANGE_MIN_YEAR } from '@/validations/activity-evidence';

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
 *
 * **`granularity="month"`** swaps the day calendar for a grid of MONTHS, for
 * a period tracked by month — наукова робота's «Період виконання» (D48/D49).
 * Same trigger, same popover, the same click rule (`stepRange`, §9 of
 * `docs/aurora.md`) and the same capsule band; the values become `"YYYY-MM"`.
 * One click is a one-month period — `to` stays empty and the caller reads it
 * as `from`. There is no month mode in react-day-picker, which is why this is
 * drawn here rather than configured.
 */
export function DateRangeInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  granularity = 'day',
  min,
  max,
  showUntil,
}: {
  id?: string;
  value?: IsoRange;
  onChange: (next: IsoRange | undefined) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** `'month'`: pick whole months, values `"YYYY-MM"`. */
  granularity?: 'day' | 'month';
  /** Month mode: the first and last month that may be CLICKED, `"YYYY-MM"`. */
  min?: string;
  max?: string;
  /** Month mode: the last month SHOWN, greyed past `max` — so the whole
   *  period reads, not just the part already reachable. Defaults to `max`. */
  showUntil?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const months = granularity === 'month';
  const selected: DateRange | undefined = value?.from
    ? { from: day(value.from), to: day(value.to) }
    : undefined;

  const label = months
    ? monthRangeText(value)
    : value?.from && value?.to
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
        {months ? (
          <MonthGrid
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            showUntil={showUntil ?? max}
          />
        ) : (
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
            // The same bounds the schema enforces, so the picker cannot offer a
            // day the server would refuse.
            startMonth={new Date(RANGE_MIN_YEAR, 0)}
            endMonth={new Date(RANGE_MAX_YEAR, 11)}
            autoFocus
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Month mode ──────────────────────────────────────────────────────────────

const MONTH_SHORT = [
  'Січ',
  'Лют',
  'Бер',
  'Кві',
  'Тра',
  'Чер',
  'Лип',
  'Сер',
  'Вер',
  'Жов',
  'Лис',
  'Гру',
];
const MONTH_FULL = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

/** `"YYYY-MM"` ⇄ a month index (months since year 0) ⇄ the 1st as a Date —
 *  the Date is only what `stepRange` compares. */
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const monthKey = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
const monthDate = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = (key: string) => `${MONTH_FULL[monthIndex(key) % 12]} ${key.slice(0, 4)}`;

/** «Вересень 2026», «Вересень – Грудень 2026», «Листопад 2026 – Лютий 2027». */
function monthRangeText(value?: IsoRange): string | null {
  if (!value?.from) return null;
  if (!value.to || value.to === value.from) return monthName(value.from);
  return value.from.slice(0, 4) === value.to.slice(0, 4)
    ? `${MONTH_FULL[monthIndex(value.from) % 12]} – ${monthName(value.to)}`
    : `${monthName(value.from)} – ${monthName(value.to)}`;
}

/**
 * The months between `min` and `showUntil`, one row per calendar year, four to
 * a row. Clicks alternate ends exactly as the day calendar's do (§9): start,
 * end, start, end, and an inverted write is redirected, never swapped.
 *
 * Styled as the calendar's day cells are: a chosen month is a brand pill, the
 * months between sit on the pale capsule band, and the band rounds at the ends
 * of each row so a range that wraps reads as capsules, not as a bar running off
 * the edge.
 */
function MonthGrid({
  value,
  onChange,
  min,
  max,
  showUntil,
}: {
  value?: IsoRange;
  onChange: (next: IsoRange | undefined) => void;
  min?: string;
  max?: string;
  showUntil?: string;
}) {
  // Which end the next click writes — `stepRange` cannot read it off the
  // range. Resets when the popover remounts, like the day calendar's.
  const [nextEnd, setNextEnd] = React.useState<RangeEnd>('from');

  if (!min || !showUntil) return null;
  const first = monthIndex(min);
  const last = monthIndex(showUntil);
  const clickableTo = max ? monthIndex(max) : last;

  const from = value?.from ? monthIndex(value.from) : null;
  const to = value?.to ? monthIndex(value.to) : from;

  function click(index: number) {
    const current: DateRange | undefined = value?.from
      ? { from: monthDate(value.from), to: value.to ? monthDate(value.to) : undefined }
      : undefined;
    const step = stepRange(current, monthDate(monthKey(index)), nextEnd);
    setNextEnd(step.next);
    onChange({
      from: dateKey(step.range.from!),
      to: step.range.to ? dateKey(step.range.to) : undefined,
    });
  }

  // One row per calendar year.
  const years = new Map<number, number[]>();
  for (let i = first; i <= last; i++) {
    const y = Math.floor(i / 12);
    years.set(y, [...(years.get(y) ?? []), i]);
  }

  return (
    <div className="space-y-3 p-3">
      {[...years.entries()].map(([year, indexes]) => (
        <div key={year} className="space-y-1">
          <p className="px-1 text-xs font-medium text-muted-foreground">{year}</p>
          <div className="grid grid-cols-4">
            {indexes.map((i, col) => {
              const isEnd = from !== null && (i === from || i === to);
              const inBand = from !== null && to !== null && to > from && i >= from && i <= to;
              const middle = inBand && !isEnd;
              const locked = i < first || i > clickableTo;
              return (
                <div
                  key={i}
                  className={cn(
                    inBand && 'bg-brand/12',
                    inBand && i === from && 'rounded-l-full',
                    inBand && i === to && 'rounded-r-full',
                    // The band rounds at the row's own edges too.
                    middle && col === 0 && 'rounded-l-full',
                    middle && col === 3 && 'rounded-r-full'
                  )}
                >
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={isEnd || middle}
                    aria-label={monthName(monthKey(i))}
                    onClick={() => click(i)}
                    className={cn(
                      'h-8 w-full min-w-12 rounded-full px-2 text-sm transition-colors outline-none',
                      'hover:bg-muted focus-visible:ring-3 focus-visible:ring-brand/25',
                      'disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-50',
                      isEnd && 'bg-brand text-brand-foreground hover:bg-brand',
                      middle && 'bg-transparent hover:bg-transparent'
                    )}
                  >
                    {MONTH_SHORT[i % 12]}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
