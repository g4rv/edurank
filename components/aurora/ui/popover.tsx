'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * «Аврора»'s popover — a drop-in replacement for `components/ui/popover`.
 *
 * The panel a date picker, a combobox list or a small menu lands in. Three
 * changes, all the same idea — it is a card that happens to float:
 *
 * - **`bg-card` and a border**, not `bg-popover` + a ring. It is the same
 *   surface as everything else on the page, so it belongs to the same family.
 * - **`shadow-float`, not `shadow-md`.** A popover usually opens ON TOP of a
 *   card, and a card-weight shadow disappears there: the two surfaces are the
 *   same colour, so the shadow has nothing to fall on. `--shadow-float` is the
 *   same shape, deeper and wider.
 * - **`rounded-xl` and `overflow-hidden`**, matching the cards and clipping a
 *   list's first and last rows instead of letting them square off the corners.
 */
function PopoverContent({
  className,
  align = 'center',
  // Opens ABOVE the trigger by default (owner, 2026-09-07). A popover's usual
  // content here is a calendar — tall, and usually triggered from a field
  // partway down a form, where opening downward pushes it off the fold.
  //
  // Radix keeps its collision detection either way: with no room above it
  // still flips below, so `top` is a preference rather than a promise.
  side = 'top',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-2.5 text-sm text-card-foreground shadow-float outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <div data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
