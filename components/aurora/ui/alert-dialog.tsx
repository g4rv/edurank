'use client';

import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { auroraButtonVariants } from './button';
import { scrim } from './overlay';

/**
 * «Аврора»'s confirm dialog — a drop-in replacement for
 * `components/ui/alert-dialog`, which is the most-used component in this app
 * after the button itself (21 imports).
 *
 * Three changes, and they are the same three as `AuroraPopover`, because a
 * dialog is a card that happens to float:
 *
 * - **`bg-card`, not `bg-background`.** The page ground is not a surface; a
 *   dialog painted in it is a hole in the middle of the screen rather than
 *   something lying on top.
 * - **`shadow-float`, not `shadow-lg`.** A dialog opens over cards, and a
 *   card-weight shadow has nothing to fall on there.
 * - **The scrim is shared** with the sheet — see `overlay.ts`.
 *
 * `AlertDialogAction` keeps `destructive` as its DEFAULT variant, because
 * almost every confirm in this app is a deletion or a discard and every
 * existing call site expects a red button with no `variant` prop. It now
 * accepts one, for the confirms that are not — closing a rating year is
 * irreversible without being destructive.
 */

const AuroraAlertDialog = AlertDialogPrimitive.Root;
const AuroraAlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AuroraAlertDialogPortal = AlertDialogPrimitive.Portal;

function AuroraAlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(scrim, className)}
      {...props}
    />
  );
}

function AuroraAlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AuroraAlertDialogPortal>
      <AuroraAlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-float duration-150',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      />
    </AuroraAlertDialogPortal>
  );
}

function AuroraAlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function AuroraAlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function AuroraAlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-base font-semibold tracking-[-0.01em]', className)}
      {...props}
    />
  );
}

function AuroraAlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function AuroraAlertDialogAction({
  className,
  variant = 'destructive',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: 'default' | 'destructive';
}) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(auroraButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

function AuroraAlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(auroraButtonVariants({ variant: 'outline' }), className)}
      {...props}
    />
  );
}

export {
  AuroraAlertDialog,
  AuroraAlertDialogAction,
  AuroraAlertDialogCancel,
  AuroraAlertDialogContent,
  AuroraAlertDialogDescription,
  AuroraAlertDialogFooter,
  AuroraAlertDialogHeader,
  AuroraAlertDialogTitle,
  AuroraAlertDialogTrigger,
};
