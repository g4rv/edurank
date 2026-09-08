import * as React from 'react';

import { cn } from '@/lib/utils';
import { fieldSurface } from './field-surface';

/**
 * «Аврора»'s multi-line field — a drop-in replacement for
 * `components/ui/textarea`.
 *
 * Takes the shared surface, then overrides the two things a textarea cannot
 * inherit from a single-line control: it has no fixed height, and its padding
 * is symmetrical because text starts at the top rather than sitting on a
 * centre line.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldSurface('default'), 'h-auto min-h-16 px-2.5 py-1.5', className)}
      {...props}
    />
  );
}

export { Textarea };
