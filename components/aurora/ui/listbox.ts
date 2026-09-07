import { cn } from '@/lib/utils';

/**
 * The look of a list that floats over the page — defined once, worn by the
 * select and the combobox.
 *
 * They are the same control to somebody filling a form. The only real
 * difference is that a combobox lets you type to narrow the list; everything
 * else — the panel, the rows, the tick on the chosen one — should be
 * indistinguishable, and was not (owner, 2026-09-07). The select had rounded
 * rows inset in a padded panel, a `ring` instead of a border and its tick
 * pinned absolutely to the right edge; the combobox had full-bleed rows, a
 * bordered card and its tick pushed over with `ml-auto`. Two people describing
 * the same thing from memory.
 *
 * The combobox's shape won, because it is the one that survives a list of one:
 * panel padding leaves a pale sliver above and below a single highlighted row,
 * which reads as a rendering fault rather than as breathing room.
 *
 * The select's HIGHLIGHT won. The combobox used `bg-muted/60`, and `--muted` is
 * within a hair of the page ground — the trap documented in `docs/aurora.md`,
 * hit three times now. A row you are pointing at has to be visible, so it takes
 * the brand tint like everything else that responds.
 */

/**
 * The floating panel itself. Width, max-height and overflow are the caller's:
 * the select scrolls on the panel (`overflow-y-auto`) while the combobox
 * scrolls on the list inside it and clips with `overflow-hidden`, and baking
 * one of those in here would fight the other.
 */
export const listPanel = 'rounded-xl border bg-card p-0 shadow-float';

/** The scrolling area inside it. */
export const listScroll = 'max-h-60 overflow-y-auto';

/**
 * One row. Full-bleed — no rounding and no inset, so the panel's own corners do
 * the clipping and a single row fills its panel exactly.
 *
 * Covers all three ways a row can be «the one»: `hover` for a mouse in the
 * combobox, `data-highlighted` for Radix's keyboard walk through the select,
 * and `focus` for anything that lands there another way.
 */
export const listRow = cn(
  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-hidden select-none',
  'hover:bg-brand/10 hover:text-brand-strong',
  'focus:bg-brand/10 focus:text-brand-strong',
  'data-highlighted:bg-brand/10 data-highlighted:text-brand-strong',
  'data-disabled:pointer-events-none data-disabled:opacity-50',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
);

/**
 * The row already chosen. Weight and the tick, no second fill — a tint here
 * would have to compete with the hover tint, and the two together say less than
 * either alone.
 */
export const listRowSelected = 'font-medium';

/**
 * The same, keyed off Radix's own attribute, for a component that marks the
 * chosen row itself. Spelled out rather than interpolated from the constant
 * above: Tailwind generates only the classes it can SEE in the source, and
 * `data-[state=checked]:${listRowSelected}` is invisible to its scanner.
 */
export const listRowSelectedState = 'data-[state=checked]:font-medium';

/** The tick on the chosen row. Pushed right, so showing it moves nothing. */
export const listRowCheck = 'ml-auto size-4 shrink-0';

/** A heading over a group of rows. */
export const listLabel = 'px-3 py-1.5 text-xs text-muted-foreground';

/** «Нічого не знайдено». */
export const listEmpty = 'py-6 text-center text-sm text-muted-foreground';
