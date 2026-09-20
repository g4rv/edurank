'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { scrim } from './overlay';

/**
 * «Аврора»'s dialog — a centred panel over a dimmed page.
 *
 * **Why this exists when `AlertDialog` already did.** They are not the same
 * control. Radix's alert dialog renders `role="alertdialog"`, which tells a
 * screen reader «an urgent message that needs an answer before you go on», and
 * it deliberately refuses to close on an outside click or Esc-without-choice —
 * because the whole point is that you must pick one of two outcomes. That is
 * right for «видалити?» and wrong for a form: filling one in is not an
 * interruption, and abandoning it halfway is an ordinary thing to do.
 *
 * So: `AlertDialog` for a decision, `Dialog` for a task, `Sheet` for a task you
 * want to do while still seeing the list behind it.
 *
 * It takes the same three decisions the other two already made, so the three
 * float at one height and in one colour:
 *
 * - **`bg-card`, not `bg-background`.** The page ground is not a surface, and a
 *   panel painted in it is a hole in the middle of the screen (§10).
 * - **`shadow-float`, not `shadow-lg`.** A dialog opens over cards, where a
 *   card-weight shadow has nothing to fall on.
 * - **The shared `scrim`** — one value, and no `backdrop-blur` on it: a scrim
 *   covers the whole viewport, so with GPU acceleration off it becomes a
 *   full-screen CPU blur on every open and close.
 *
 * **The body scrolls, not the panel.** A dialog whose height depends on its
 * content — an evidence form is two fields for one indicator and eight for
 * another — must not grow past the viewport and take its own footer with it.
 * The panel is capped, the header and footer stay put, and only the middle
 * moves. That is the same three-part split `Table` uses and for the same
 * reason.
 */
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={scrim} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // `max-h` and a flex column, so a long form scrolls inside rather than
          // pushing the panel off the screen. `w-[calc(100%-2rem)]` keeps a
          // gutter on a phone, matching the alert dialog.
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-4rem)] w-[calc(100%-2rem)] max-w-lg',
          // **No `overflow-hidden` here** (owner, 2026-09-20). A combobox inside
          // a dialog has to portal INTO this element — Radix locks scrolling
          // with `shards: [contentRef]`, so a list portalled anywhere else
          // keeps its scrollbar and ignores the wheel. Clipping the panel was
          // the price: this element also carries a transform, which makes it a
          // containing block, so even a `position: fixed` popper was cut off at
          // its edge. Nothing needs the clip — the header and footer cover the
          // rounded corners, and the BODY does its own scrolling.
          '-translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border',
          'bg-card text-card-foreground shadow-float duration-150',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      >
        {children}
        {/* A real button, not a bare `X` at `opacity-70`. The sheet's own note
            explains it: a 16px glyph in the corner is not a touch target, and
            it needs the brand focus ring like every other control. */}
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
            <span className="sr-only">Закрити</span>
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Title and description. Stays put while the body scrolls under it. */
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex shrink-0 flex-col gap-1 border-b px-6 py-4 pr-14', className)}
      {...props}
    />
  );
}

/** The part that scrolls. Everything a person fills in goes here. */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-4', className)}
      {...props}
    />
  );
}

/**
 * Pinned below the body, so the action is never found by scrolling.
 *
 * `justify-end` on anything wider than a phone: the confirm sits where the eye
 * leaves the form. Stacked and full-width below that, because two buttons side
 * by side at 360px are two small targets.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-snug font-semibold tracking-[-0.01em]', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-foreground-soft', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
