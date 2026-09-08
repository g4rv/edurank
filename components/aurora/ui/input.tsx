import * as React from 'react';

import { cn } from '@/lib/utils';
import { fieldSurface, type FieldSize } from './field-surface';

/**
 * «Аврора»'s text field — a drop-in replacement for `components/ui/input`.
 *
 * Same props, same `data-slot`, same default height, so swapping the import
 * changes nothing about layout. What changes is the surface:
 *
 * - **Filled, not transparent.** The shadcn field is `bg-transparent` with a
 *   border. On a translucent panel that leaves the input and its card the same
 *   colour, and the boundary alone has to do all the work. A lighter fill with
 *   a soft inner shadow reads as cut *into* the surface instead.
 * - **The focus ring is the brand**, not a neutral grey.
 *
 * Everything visual comes from `fieldSurface()` so that all fourteen controls
 * share one definition — see the note there.
 */
function Input({
  className,
  type,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & { size?: FieldSize }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldSurface(size),
        // `file:` styling has nowhere else to live — it applies to this element
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Input };
