'use client';

import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * «Аврора»'s label — a drop-in replacement for `components/ui/label`.
 *
 * Unchanged from the original except for weight. A label is de-emphasised by
 * SIZE alone here: darkening or shrinking it as well was tried on the profile
 * cards and rejected — a label should recede, because the value beside it is
 * what anybody came to read, but two axes of de-emphasis at once made labels
 * vanish. See `docs/aurora.md`.
 */
function AuroraLabel({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { AuroraLabel };
