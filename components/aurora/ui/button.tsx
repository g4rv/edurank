import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * «Аврора»'s button — a drop-in replacement for `components/ui/button`.
 *
 * **Every variant, size and prop matches the original**, deliberately: the plan
 * is to try these on the auth pages and then, if they hold up, swap the imports
 * in place. A component that only covers the two cases the login screen needs
 * would make that swap a rewrite instead of a rename.
 *
 * What actually changes:
 *
 * - **`default` is the brand, not near-black.** `--primary` is monochrome, and
 *   on the wash a black rectangle is the loudest thing on screen fighting the
 *   whole palette. This is the change that most needs judging in a browser, and
 *   doing it here rather than by editing `--primary` means it can be judged
 *   without touching the other 40-odd screens first.
 * - **Heights are UNCHANGED** (`h-8` default). The app is built on this scale
 *   and a taller default would silently reflow every toolbar and table filter.
 *   `xl` is new, for the one-action-per-screen case the auth pages are.
 * - Hover lifts by a pixel instead of only darkening — the surface is lit here,
 *   so it should behave like something with a light on it.
 */
const auroraButtonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-brand/35 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // `border-0` is load-bearing. The shared base carries shadcn's
        // `border border-transparent bg-clip-padding`, which clips the
        // background to the PADDING box — so a filled variant paints nothing
        // into its own 1px transparent border and whatever is behind the button
        // shows through as a hairline ring. Invisible on shadcn's near-black
        // fill; on a gradient over a pale card it reads as a white outline.
        // Removing the border is the fix rather than switching to
        // `bg-clip-border`, because both clip utilities live in the same
        // Tailwind layer and which one wins depends on their generated order,
        // not on the order they are written here.
        default: 'aurora-primary border-0 hover:-translate-y-px active:translate-y-0',
        // Drawn for a SOLID card, which is where secondary actions actually
        // live — the first pass used `bg-white/55` + `backdrop-blur-sm`, which
        // is a glass treatment: on a white card it merely reads as dirty grey,
        // and it pays for a blur that has nothing behind it to blur.
        outline:
          'border-foreground/12 bg-card text-foreground shadow-xs hover:border-foreground/25 hover:bg-foreground/4 aria-expanded:bg-foreground/6 dark:border-white/15 dark:bg-white/4 dark:hover:bg-white/10',
        secondary:
          'bg-foreground/6 text-foreground hover:bg-foreground/10 aria-expanded:bg-foreground/10 dark:bg-white/8 dark:hover:bg-white/14',
        ghost:
          'hover:bg-foreground/6 hover:text-foreground aria-expanded:bg-foreground/6 dark:hover:bg-white/8',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/25 dark:bg-destructive/20 dark:hover:bg-destructive/30',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        /** New: a screen whose whole purpose is one action — login, activate. */
        xl: 'h-11 gap-2 rounded-xl px-5 text-[0.95rem]',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof auroraButtonVariants> & {
    asChild?: boolean;
    /** Work is in flight — spinner in place of the leading icon, and disabled.
     *  Ignored with `asChild`, where the child owns its own content. */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';
  const showSpinner = loading && !asChild;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(auroraButtonVariants({ variant, size, className }))}
      disabled={disabled || (loading && !asChild)}
      aria-busy={showSpinner || undefined}
      {...props}
    >
      {showSpinner ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, auroraButtonVariants };
