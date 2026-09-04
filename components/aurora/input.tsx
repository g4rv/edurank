import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * «Аврора»'s text field — a drop-in replacement for `components/ui/input`.
 *
 * Same props (`React.ComponentProps<'input'>`), same `data-slot`, same default
 * height, so swapping the import changes nothing about layout. What changes is
 * the surface:
 *
 * - **Filled, not transparent.** The shadcn field is `bg-transparent` with a
 *   border. On a translucent glass card that leaves the input and the card the
 *   same colour, and the boundary alone has to do all the work. A lighter fill
 *   with a soft inner shadow reads as cut *into* the panel instead.
 * - **The focus ring is the brand.** It was neutral grey — the one moment the
 *   interface confirms it is listening, spent on nothing.
 * - `--input`'s carefully measured 3:1 boundary is not used here, because the
 *   fill now carries that contrast; see `.aurora-field` in `globals.css`.
 *
 * `size` is new and additive: the app's fields stay `default`, and only screens
 * that are nothing but one form ask for `lg`.
 */
function AuroraInput({
  className,
  type,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & { size?: 'default' | 'lg' }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'aurora-field w-full min-w-0 rounded-lg border text-base transition-all outline-none',
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'focus-visible:border-brand/55 focus-visible:ring-3 focus-visible:ring-brand/25',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        size === 'lg' ? 'h-11 px-3.5 py-2' : 'h-8 px-2.5 py-1 md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { AuroraInput };
