'use client';

import * as React from 'react';
import {
  DayPicker,
  formatCaption as defaultFormatCaption,
  getDefaultClassNames,
  type DateRange,
  type DayButton,
  type Locale,
  type OnSelectHandler,
} from 'react-day-picker';
import { uk } from 'date-fns/locale';

import { stepRange, type RangeEnd } from '@/lib/forms/date-range';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from 'lucide-react';

/**
 * date-fns gives Ukrainian month names in lower case («вересень»), because that
 * is how the word is written mid-sentence. A calendar caption is a heading, not
 * a sentence, so it takes a capital. `toLocaleUpperCase` rather than
 * `toUpperCase` so Cyrillic follows the locale's own casing rules.
 *
 * Weekday abbreviations stay lower case (`пн вт ср`) — that is the Ukrainian
 * convention, and unlike the caption they are not headings.
 */
function capitaliseCaption(value: string) {
  return value.charAt(0).toLocaleUpperCase('uk') + value.slice(1);
}

/**
 * «Аврора»'s calendar — a drop-in replacement for `components/ui/calendar`.
 *
 * Wraps react-day-picker, so almost everything here is its class map and is
 * copied untouched. Two things change, and both are the same change:
 *
 * - **The selected day is the brand**, not `--primary`. A near-black square on
 *   a calendar reads as «blocked out» rather than «chosen» — the opposite of
 *   what it means.
 * - **The keyboard focus ring is the brand**, matching every other control.
 * - **The days BETWEEN the two ends are visible.** The connector was `bg-muted`
 *   — and `--muted` is rgb(245,245,245) against a white card, so a selected
 *   range showed its two endpoints and nothing joining them. It is `brand/12`
 *   now: the same hue as the endpoints, light enough that the dates stay
 *   readable on top of it. Same trap as the tab bar; see `docs/aurora.md`.
 *
 * The range styling (`range_start` / `range_middle` / `range_end`) follows the
 * same rule, so a selected range does not change colour halfway along.
 *
 * **Ukrainian by default** (owner, 2026-09-07). react-day-picker ships `en-US`
 * as its built-in locale and does NOT read the browser's — so every calendar in
 * the app said «September 2026 / Su Mo Tu» until this default existed. The
 * `locale` prop still overrides it; nothing else in the app has a reason to.
 */
function Calendar(
  allProps: React.ComponentProps<typeof DayPicker> & {
    buttonVariant?: React.ComponentProps<typeof Button>['variant'];
  }
) {
  const {
    className,
    classNames,
    showOutsideDays = true,
    // Always six week rows. February 2026 needs five and March needs six, so
    // paging between them resized the panel — and because a date popover opens
    // UPWARD, the whole calendar jumped up the page as the row appeared
    // (owner, 2026-09-08). The sixth row is filled with the neighbouring
    // month's days, which `showOutsideDays` already draws greyed.
    fixedWeeks = true,
    captionLayout = 'label',
    buttonVariant = 'ghost',
    locale = uk,
    formatters,
    components,
    ...props
  } = allProps;
  const defaultClassNames = getDefaultClassNames();

  // Clicks write the two ends in turn — see `stepRange` for the rule and for
  // what is wrong with react-day-picker's own. Which end is next cannot be read
  // off the range, so it is the one piece of state this component keeps.
  //
  // It resets to `from` on remount, which means closing and reopening a date
  // popover starts the cycle at the start date. That is the right default:
  // reopening reads as beginning again, not as resuming mid-pick.
  const [nextEnd, setNextEnd] = React.useState<RangeEnd>('from');

  // Two type notes, both about the same union. It is narrowed off `allProps`
  // rather than the rest object, because destructuring a discriminated union
  // loses the tie between `mode`, `selected` and `onSelect` — only here does
  // TypeScript still know all three are the range flavour. And the handler is
  // annotated with `OnSelectHandler` rather than an `Extract` off the union,
  // because `mode="range"` has two prop shapes (`required` or not) whose
  // `onSelect` signatures differ, and a union of signatures leaves the
  // parameters with no contextual type at all. The cast on `dayPickerProps` is
  // what hands the result back across that boundary.
  let rangeProps: Partial<React.ComponentProps<typeof DayPicker>> | undefined;
  if (allProps.mode === 'range' && allProps.onSelect) {
    const onSelect = allProps.onSelect as OnSelectHandler<DateRange | undefined>;
    const selected = allProps.selected;

    // react-day-picker's own proposal is dropped on the floor, deliberately —
    // `stepRange` decides the whole range from the day that was clicked.
    const handleSelect: OnSelectHandler<DateRange | undefined> = (
      _proposed,
      triggerDate,
      modifiers,
      e
    ) => {
      const step = stepRange(selected, triggerDate, nextEnd);
      setNextEnd(step.next);
      onSelect(step.range, triggerDate, modifiers, e);
    };

    // A hover PREVIEW of the pending range was built here and taken out again
    // (owner, 2026-09-07). Mailjet's calendar does it and it reads well there;
    // on ours the band is a pale tint rather than a solid fill, so a preview of
    // it is a faint thing flickering under the cursor — motion without a
    // message. The two clicks are legible enough on their own.
    rangeProps = { onSelect: handleSelect } as Partial<React.ComponentProps<typeof DayPicker>>;
  }

  // Where a range wraps to the next week the band is cut by the calendar's own
  // edge, and a square cut reads as «this continues off-screen» — which is
  // exactly what it is not. Rounding the first and last cell of every row turns
  // each week into its own capsule, matching the two real ends of the band.
  //
  // The plain `rounded-none` on a middle cell does not fight this: a
  // `:first-child` / `:last-child` variant carries the extra pseudo-class
  // specificity and wins whatever order Tailwind emits them in.
  const bandEdge = props.showWeekNumber
    ? '[&:nth-child(2)]:rounded-l-full last:rounded-r-full'
    : 'first:rounded-l-full last:rounded-r-full';

  const dayPickerProps = {
    ...props,
    ...rangeProps,
  } as React.ComponentProps<typeof DayPicker>;

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks={fixedWeeks}
      className={cn(
        'group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatCaption: (month, options, dateLib) =>
          capitaliseCaption(defaultFormatCaption(month, options, dateLib)),
        formatMonthDropdown: (date) =>
          capitaliseCaption(date.toLocaleString(locale?.code, { month: 'long' })),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        // `pointer-events-none`, with the two buttons taking it back.
        //
        // This bar is absolutely positioned across the FULL width of the
        // caption row and holds ‹ and › at its two ends — so the whole middle,
        // where the month and year controls sit, is the nav div itself, and it
        // swallowed every click aimed at them (owner, 2026-09-08).
        //
        // It never showed while the dropdowns were native `<select>`s, because
        // those were `absolute inset-0`: a positioned element paints above a
        // static sibling, so they sat on top of this bar by accident. The
        // moment the caption held an ordinary static control, it went dead.
        // Fixing it here rather than positioning that control means the next
        // thing put in a caption works too.
        nav: cn(
          'pointer-events-none absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'pointer-events-auto size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'pointer-events-auto size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns
        ),
        // The month control is sized for the LONGEST name, not for the one on
        // screen. «Лютий» and «Березень» are four characters apart, so a `w-fit`
        // trigger changed the caption's width — and the caption is what the
        // panel is as wide as — every time the month changed. Reserving the
        // width once means paging moves nothing.
        //
        // `min-w`, not `w`: the number is a floor for Ukrainian month names at
        // this size, and a longer name in some other locale still fits rather
        // than being clipped.
        months_dropdown: 'min-w-30 justify-between',
        years_dropdown: 'min-w-20 justify-between',
        // `dropdown_root`, `dropdown` and the dropdown half of `caption_label`
        // are gone with the native `<select>` they dressed — see
        // `CalendarDropdown`. What was here painted a caption that LOOKED right
        // and left the list to the operating system.
        caption_label: cn('text-sm font-medium select-none', defaultClassNames.caption_label),
        month_grid: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none',
          defaultClassNames.weekday
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
        week_number: cn(
          'text-[0.8rem] text-muted-foreground select-none',
          defaultClassNames.week_number
        ),
        // shadcn's own `[&:first-child…]` / `[&:last-child…]` overrides are gone
        // from here. They reached past the cell to re-round the BUTTON inside
        // it at the two edges of a week, and a descendant selector outranks the
        // button's own `data-[range-end=true]:rounded-full` — so a chosen day
        // landing on пн or нд came out with one flattened side. The button
        // decides its own shape now; the cell only carries the band.
        day: cn(
          'group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none',
          defaultClassNames.day
        ),
        // The band behind a range runs the WHOLE width, under both endpoints
        // included — the endpoints are filled buttons sitting ON it, not gaps
        // in it. Rounded at the outer ends only, so it reads as one line.
        //
        // The band behind a range: rounded at the two ends, square in between,
        // and NOTHING else. It carried `after:` bridges that painted an extra
        // square block past each rounded end, so the connector looked like a
        // pill with a rectangle stuck to it. The cells already touch; there was
        // no gap for a bridge to close.
        range_start: cn('rounded-l-full bg-brand/12', bandEdge, defaultClassNames.range_start),
        range_middle: cn('rounded-none bg-brand/12', bandEdge, defaultClassNames.range_middle),
        range_end: cn('rounded-r-full bg-brand/12', bandEdge, defaultClassNames.range_end),
        // Today is RINGED, not filled — it has to survive also being selected.
        // A fill would simply be overpainted by the blue and today would vanish
        // on the one day it matters most. It was `bg-muted`, which on a white
        // card is invisible anyway.
        // The CELL for today carries no shape of its own — the button inside it
        // does. `data-[selected=true]:rounded-none` lived here to square the
        // cell off inside a range; the band under it is now what draws that
        // shape, and squaring the cell only clipped the pill.
        today: cn('text-foreground', defaultClassNames.today),
        outside: cn(
          'text-muted-foreground aria-selected:text-muted-foreground',
          defaultClassNames.outside
        ),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />;
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('size-4', className)} {...props} />;
          }

          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('size-4', className)} {...props} />;
          }

          return <ChevronDownIcon className={cn('size-4', className)} {...props} />;
        },
        DayButton: ({ ...props }) => <CalendarDayButton locale={locale} {...props} />,
        Dropdown: CalendarDropdown,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...dayPickerProps}
    />
  );
}

/**
 * The month and year pickers in the caption — our select, not the browser's.
 *
 * react-day-picker's own `Dropdown` is shadcn's trick: a real `<select>`
 * stretched over the caption at `opacity-0`, so the closed control looks like
 * the design and the OPEN list is the operating system's. On Windows that is a
 * grey column with a blue highlight and its own scrollbar, sitting on top of a
 * calendar it shares nothing with (owner, 2026-09-08). Nothing about it can be
 * styled — same problem, and the same answer, as `<input type="date">`.
 *
 * Both dropdowns come through here: `MonthsDropdown` and `YearsDropdown` each
 * default to `Dropdown`, so overriding the one covers both.
 *
 * **`onChange` is synthesised.** DayPicker types this as a `<select>` handler
 * and reads exactly one thing off it — `e.target.value`, parsed as a number
 * (`handleMonthChange` / `handleYearChange` in `DayPicker.js`). A bare object
 * with that one field is therefore the whole contract; there is no event to
 * forward, because Radix's select never made one.
 *
 * Nesting a Radix select inside the Radix popover this calendar lives in is
 * safe: the select's content registers as the higher dismissable layer, so the
 * popover below it stops treating clicks as «outside» and does not close under
 * the open list.
 */
function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  options?: { value: number; label: string; disabled: boolean }[];
  // Mirrors `typeof components.Dropdown`'s own parameter. The type is declared
  // inside react-day-picker's `components/Dropdown` and not re-exported from
  // the package root, so it is written out rather than imported from a path
  // that is free to move between patch releases.
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'>) {
  return (
    <Select
      value={value !== undefined ? String(value) : undefined}
      onValueChange={(next) =>
        onChange?.({
          target: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        // The caption NAVIGATES — it is not a field you put a value into, so it
        // drops the filled surface and reads as the caption text it replaces,
        // with a chevron. Utilities beat `.aurora-field` here because Tailwind's
        // utilities layer is declared after its components layer, which is where
        // that class lives; specificity does not come into it.
        //
        // The hover tint is `--brand`, per §3 — a foreground tint on a white
        // card is grey, which is the look this design exists to leave behind.
        className={cn(
          'gap-1 border-transparent bg-transparent px-1.5 shadow-none hover:bg-brand/10 hover:text-brand-strong',
          // `months_dropdown` / `years_dropdown` from the class map above — this
          // is how the two are told apart, since both render through here.
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-56">
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
            className="tabular-nums"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  // The single chosen day, when there is no range at all.
  const selectedSingle =
    modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle;

  // Today keeps its gold fill everywhere EXCEPT where a blue fill already owns
  // the cell — the two ends of a range, or a single chosen day. In the MIDDLE
  // of a range it stays gold: the band behind it is a tint, not a fill, so
  // there is nothing to fight.
  const todayOwnsItsFill =
    modifiers.today && !modifiers.range_start && !modifiers.range_end && !selectedSingle;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      // Gold only while today is not otherwise chosen. Selection wins, because
      // a blue day plainly says «this is what you picked» and the date itself
      // still says it is today — whereas two fills fighting says neither.
      data-today={todayOwnsItsFill}
      className={cn(
        'relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal',
        'group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-brand/55 group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-brand/25',

        // The three ways a day can be chosen. All three are the brand fill, and
        // all three are CIRCLES — `rounded-full`, not `--cell-radius`.
        //
        // The cell behind a chosen day carries the band's `brand/12` and the
        // band is a capsule, so wherever the pill's curve is tighter than the
        // band's, the tint shows past it — a rounded blue pill sitting in a
        // square-cornered light block. Matching the radii is what removes it:
        // the cell is `aspect-square`, so `rounded-full` on a pill exactly meets
        // the capsule it sits on.
        'data-[selected-single=true]:rounded-full data-[selected-single=true]:bg-brand data-[selected-single=true]:text-brand-foreground',
        'data-[range-start=true]:rounded-full data-[range-start=true]:bg-brand data-[range-start=true]:text-brand-foreground',
        'data-[range-end=true]:rounded-full data-[range-end=true]:bg-brand data-[range-end=true]:text-brand-foreground',
        // The days between carry no fill of their own — the band behind them
        // does it, so the connector is one rectangle rather than a row of tiles.
        'data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-transparent data-[range-middle=true]:text-foreground',

        // Today: a gold RING, kept even when the day is also selected — a fill
        // would be overpainted by the blue and today would vanish on the one
        // day it matters most.
        //
        // The ring uses `--gold-strong`, not `--gold`: the amber itself measures
        // 2.20:1 on a white card, under the 3.0 a UI indicator needs. The number
        // inside stays `--foreground` rather than going gold, because gold text
        // does not reach 4.5 without turning brown.
        // Today: filled gold, white numeral (owner, 2026-09-07). `data-today`
        // above is already false whenever the day is also selected, so the blue
        // never has to fight the gold.
        //
        // **Below AA, knowingly.** White on `--gold` measures 2.20:1 and needs
        // 4.5; the gold would have to go to #a6560a — a burnt orange, not this
        // palette — to get there. `text-foreground` on the same fill reads 9:1
        // and is the one-word change if it ever matters.
        'data-[today=true]:rounded-full data-[today=true]:bg-gold data-[today=true]:font-semibold data-[today=true]:text-white',

        'dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70',
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
