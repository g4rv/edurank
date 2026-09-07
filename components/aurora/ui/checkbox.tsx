'use client';

import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * «Аврора»'s checkbox — and there was no `components/ui/checkbox` to replace.
 *
 * Three screens needed one and each grew its own: `/admin/permissions/field`
 * and `/admin/permissions/entity` use a bare `<input type="checkbox">` with
 * `accent-primary`, the licence-position picker uses the same input with
 * `accent-foreground`. So the two permission grids and the picker beside them
 * are already different colours, and none of them can carry a focus ring, an
 * invalid state, or the disabled surface every other control here has —
 * `accent-color` styles the box and nothing else.
 *
 * It is the switch's rules on a square:
 *
 * - **Unchecked is `.aurora-field`** — the same fill, border and inner shadow
 *   as a text field, because it is the same thing: a hollow waiting to be
 *   filled. That also gets the disabled surface (`docs/aurora.md` §7) for free.
 * - **Checked is the brand**, not near-black. A near-black box reads as
 *   «disabled but dark»; the accent is what the rest of this interface uses for
 *   a live, chosen state.
 *
 * Radix rather than a native input, because a native one cannot draw its own
 * tick — everything above depends on styling the mark.
 *
 * **There is no indeterminate state**, and that is deliberate (owner,
 * 2026-09-07). It was drawn first, on the assumption that the permission grid
 * has a «some of this division's fields» header — it does not. The three group
 * headings on `/admin/permissions/field` are plain text, and nothing else in
 * this app selects a whole group at once. Radix supports the state whenever a
 * select-all appears; drawing it before then is a state nobody can reach and
 * one more thing to keep working.
 */
function AuroraCheckbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'aurora-field peer size-4 shrink-0 cursor-pointer rounded-[0.3rem] border transition-all outline-none',
        'focus-visible:border-brand/55 focus-visible:ring-3 focus-visible:ring-brand/25',
        // Spelled out per state rather than shared, because Tailwind generates
        // only the class strings it can SEE — see `listbox.ts` for the same
        // note. `border-brand` closes the hairline that `.aurora-field`'s own
        // border-color would otherwise leave around the filled box.
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-foreground data-[state=checked]:shadow-none',
        'disabled:cursor-not-allowed',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { AuroraCheckbox };
