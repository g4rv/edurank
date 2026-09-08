'use client';

import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { scrim } from './overlay';

/**
 * «Аврора»'s sheet — a drop-in replacement for `components/ui/sheet`.
 *
 * A panel that slides in from the edge, over a page that stays put. A dialog by
 * mechanics — focus trap, Esc, scroll lock — but positioned against a side, so
 * the list behind it is still readable. That is the whole reason to reach for
 * this instead of the alert dialog: on `/achievements` you want to see the row
 * you are filling in and the ones around it.
 *
 * Same three changes as the alert dialog — `bg-card`, `shadow-float`, the
 * shared scrim — plus one of its own:
 *
 * **The close button is a real button.** It was a bare `X` at `opacity-70` with
 * a `focus:ring-2` and no hit area of its own, which on a touch screen is a
 * 16px target in the corner of a full-height panel. It is now an `icon-sm`
 * ghost button like every other close in the app, and it goes red on hover,
 * because leaving a half-filled submission form is the one destructive thing a
 * sheet does.
 */

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay data-slot="sheet-overlay" className={cn(scrim, className)} {...props} />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'right' | 'left';
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col gap-4 bg-card text-card-foreground shadow-float',
          'transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
          'data-[state=closed]:animate-out data-[state=open]:animate-in',
          side === 'right' &&
            'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl',
          side === 'left' &&
            'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-xl',
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Закрити"
            className="absolute top-4 right-4 text-muted-foreground hover:text-destructive"
          >
            <X />
          </Button>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1 px-6 pt-6 pr-14', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 border-t px-6 py-4', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base leading-snug font-semibold tracking-[-0.01em]', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
