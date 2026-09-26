'use client';

import * as React from 'react';
import { CalendarIcon, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fieldSurface } from './field-surface';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/**
 * A date, picked from our own calendar.
 *
 * Both places in the app that needed one used `<input type="date">`, which is
 * three separate problems and only one of them is that it looks wrong:
 *
 * 1. **The format follows the BROWSER's locale, not the app's.** On a US-locale
 *    Chrome the defence date read `04/19/2011`; on a Ukrainian one the same
 *    record reads `19.04.2011`. Two people, one row, different dates — and
 *    nothing in our code decides which.
 * 2. **The picker cannot be styled at all** — not the month names, not the week
 *    start, not the selected day. It said «April 2011 / Su Mo Tu» beside a form
 *    that is otherwise entirely Ukrainian.
 * 3. **It obeys none of §7.** Its own height, its own focus ring, a native
 *    calendar glyph — so it did not line up with the text field beside it,
 *    which is the same bug `fieldSurface()` exists to prevent.
 *
 * ## The trigger is a field, not a button
 *
 * §7 draws the line at «does a VALUE go in it». The file picker was wrong in
 * `fieldSurface()` because it runs an action; this holds a value and replaces it
 * from a list, which is exactly what `SelectTrigger` does. So it is shaped like
 * the select: same height, same fill, same brand ring, chevron swapped for a
 * calendar glyph.
 *
 * ## The year is a dropdown, not 180 clicks
 *
 * `captionLayout="dropdown"`. A defence date is routinely fifteen years back,
 * and paging a month arrow there is not a thing anybody will do — they will
 * leave the field empty instead, which is the failure §5 is about. The dropdown
 * is bounded by `min`/`max`, so the years offered are only the ones the schema
 * would accept.
 */

/** Local midnight, never `new Date(str)` — that parses as UTC and shifts a day. */
function parse(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Back to the wire format, read off the LOCAL date so it round-trips. */
function serialise(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `19.04.2011` — what `toLocaleDateString('uk-UA')` prints everywhere else. */
function display(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Both call sites narrow this; it is only the outer bound of what is sane. */
const DEFAULT_MIN = '1950-01-01';
const DEFAULT_MAX = `${new Date().getFullYear() + 1}-12-31`;

export interface DateInputProps {
  /** `YYYY-MM-DD`, or `''` for no date. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  /** `YYYY-MM-DD`. Bounds the calendar AND the year dropdown. */
  min?: string;
  max?: string;
  placeholder?: string;
  /**
   * Offer the ×.
   *
   * **Default on**, unlike `Combobox`, and for a concrete reason rather than a
   * preference: a native date input could always be emptied, so a picker that
   * cannot would be a regression on both fields this replaces. On a required
   * date, pass `clearable={false}`.
   */
  clearable?: boolean;
  /**
   * How the calendar names the month it is showing.
   *
   * `'dropdown'` here, against react-day-picker's own `'label'` default,
   * because a defence date is routinely fifteen years back and a month arrow
   * will not get anybody there — see the note at the top of this file. It is a
   * prop rather than a fixture so a field whose dates are always near today can
   * take the quieter caption and its two arrows.
   */
  captionLayout?: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years';
  className?: string;
  'aria-invalid'?: boolean;
}

export function DateInput({
  value,
  onChange,
  id,
  disabled,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  placeholder = 'Оберіть дату',
  clearable = true,
  captionLayout = 'dropdown',
  className,
  'aria-invalid': ariaInvalid,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  // `role="combobox"` must name the thing it opens. Generated rather than a
  // constant, because two of these can sit on one form.
  const panelId = React.useId();

  const selected = parse(value);
  const from = parse(min);
  const to = parse(max);
  const showClear = clearable && !!selected && !disabled;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            // `role="combobox"`, which is what this is: a control holding a
            // value that you replace from a panel. A bare button is not a form
            // field to a screen reader, so `aria-invalid` is not supported on
            // one — Radix's `SelectTrigger` takes the same role for the same
            // reason, and it is why a select may carry the invalid ring.
            role="combobox"
            aria-expanded={open}
            aria-controls={panelId}
            aria-haspopup="dialog"
            aria-invalid={ariaInvalid}
            className={cn(
              fieldSurface('default'),
              'flex items-center justify-between gap-2 text-left',
              // Room for the row of glyphs on the right, which is 8px of inset
              // plus each 16px icon plus the 4px between them.
              showClear ? 'pr-12' : 'pr-8'
            )}
          >
            <span className={cn('truncate', !selected && 'text-placeholder')}>
              {selected ? display(selected) : placeholder}
            </span>
          </button>
        </PopoverTrigger>

        {/* Both glyphs in ONE centred row.

            They were placed separately, each with its own `top-*` and `right-*`
            — so their spacing was a subtraction done by hand and their vertical
            position was a guess at half the field's height (owner, 2026-09-08).
            `inset-y-0` + `items-center` centres them against whatever the field
            actually is, and `gap` sets the distance between them once.

            The row ignores the pointer so it cannot cover the trigger under it;
            the × takes it back for itself. */}
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
          {showClear && (
            <button
              type="button"
              aria-label="Очистити"
              // `onMouseDown` with preventDefault, like `ComboboxInput`: a plain
              // click lands after the trigger has already toggled the popover,
              // so the field cleared and flew open in the same gesture.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange('');
              }}
              // `p-1 -m-1` — a 24px hit target around a 16px glyph, with the
              // negative margin taking the padding back out of the layout, so
              // the two icons stay the same size and the same distance apart.
              className="pointer-events-auto -m-1 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" />
            </button>
          )}
          <CalendarIcon className="size-4 text-muted-foreground" />
        </div>
      </div>

      <PopoverContent id={panelId} className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          // Today's month when nothing is chosen — the year dropdown is how you
          // get to 2011, not a defaultMonth guess about which decade is meant.
          defaultMonth={selected}
          captionLayout={captionLayout}
          startMonth={from}
          endMonth={to}
          disabled={{ before: from ?? new Date(0), after: to ?? new Date(8.64e15) }}
          onSelect={(date) => {
            // Clicking the selected day again clears it in single mode. Let that
            // through only where clearing is offered at all.
            if (!date) {
              if (clearable) onChange('');
              return;
            }
            onChange(serialise(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
