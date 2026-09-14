'use client';

import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { fieldSurface } from './field-surface';
import {
  listLabel,
  listPanel,
  listRow,
  listRowCheck,
  listRowSelectedState,
  listScrollbar,
} from './listbox';

/**
 * «Аврора»'s select — a drop-in replacement for `components/ui/select`.
 *
 * The whole Radix composite is copied rather than wrapped: `Select`,
 * `SelectItem`, `SelectContent` and the rest have to be imported from one
 * place, and re-exporting half of them from here and half from `ui/` is how a
 * dropdown ends up with an Аврора trigger and a shadcn menu.
 *
 * Only surfaces change. Every `data-*` hook, the placeholder handling and the
 * scroll buttons are untouched.
 *
 * The trigger wears the shared field surface, so it sits at the same height and
 * carries the same focus ring as a text input beside it — they are the same
 * control to a reader filling a form, and they used to look related only by
 * accident.
 */
import { ChevronDownIcon, CheckIcon } from 'lucide-react';

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('scroll-my-1', className)}
      {...props}
    />
  );
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        cn(
          fieldSurface('default'),
          // A select sizes to its content, unlike a text field
          'flex w-fit items-center justify-between gap-1.5 py-2 pr-2 pl-2.5 whitespace-nowrap select-none',
          'data-placeholder:text-placeholder',
          'data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)]',
          '*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5',
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        ),
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  // Drops below the trigger, like the combobox — NOT Radix's `item-aligned`
  // default, which slides the menu up so the chosen row lands on top of the
  // trigger. That reads as the menu being misplaced, and it makes a select and
  // a combobox in the same form behave like two different kinds of control.
  position = 'popper',
  align = 'start',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === 'item-aligned'}
        className={cn(
          listPanel,
          // `max-w` is the whole reason a long option no longer takes the
          // panel off the screen. Without it the panel sizes to its widest
          // row: п.3.12's label opened a 1083px menu from a 463px trigger,
          // which on a phone reached 693px past the right edge with no way
          // to scroll to it. A menu belongs to its control, so it is that
          // control's width — and a label too long for it WRAPS rather than
          // truncating, because п.3.7's two monographs differ only in their
          // last words and an ellipsis made them the same row.
          //
          // `min-w-36` still wins on a very narrow trigger, which is what it
          // is for.
          'relative z-50 max-h-(--radix-select-content-available-height) max-w-(--radix-select-trigger-width) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        align={align}
        sideOffset={sideOffset}
        {...props}
      >
        {/* **No scroll buttons** (owner, 2026-09-14). Radix mounts an up arrow
            the moment you scroll and unmounts it at the top, and both are FLOW
            siblings of the viewport — so the arrow appearing took 24px out of
            the scroll area and moved its top down by the same, measured
            464→440px. The list jumped under the cursor on the way down and
            snapped back on the way up, and because the arrow mounts DURING the
            gesture the scroller's max-scroll changed mid-wheel, which is what
            read as lag.

            Removing them is also what §8 asks for: «a select and a combobox are
            the same control to somebody filling a form», and the combobox has
            never had them — it just scrolls. */}
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            // `h-(--radix-select-trigger-height)` was in here and is wrong for a
            // popper: it pins the LIST to the height of one row.
            'data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)',
            // **The scrollbar, given back.** Radix hides it at runtime —
            // `[data-radix-select-viewport]{scrollbar-width:none}` and a
            // `::-webkit-scrollbar{display:none}` — because its own design
            // replaces the bar with the arrow buttons. Those are gone, so
            // without this you can scroll a list with no sign of how long it
            // is or where in it you stand. The shared skin, so the combobox
            // shows the same bar (§8).
            listScrollbar
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(listLabel, className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(listRow, 'w-full', listRowSelectedState, className)}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {/* After the text and pushed right with `ml-auto`, exactly as the
          combobox does it — not pinned absolutely with a reserved `pr-8` on
          every row, which indents the whole list to make room for a mark most
          rows never show. */}
      <SelectPrimitive.ItemIndicator asChild>
        <CheckIcon className={listRowCheck} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

/**
 * Prefixed like `Button` and `Input`, so a screen part-way through
 * the migration can hold both an Аврора select and a shadcn one without a name
 * collision. When `ui/select` is finally replaced this becomes a find-and-
 * replace of the prefix, which is the cheap half of that job.
 */
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
