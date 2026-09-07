'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * «Аврора»'s switch — a drop-in replacement for `components/ui/switch`.
 *
 * Two changes, both about what «on» means:
 *
 * - **On is the brand**, not `--primary`. A near-black switch is the shadcn
 *   default and reads as «disabled but dark»; the accent is what the rest of
 *   this interface uses for a live, chosen state.
 * - **The focus ring is the brand**, and offset from the track so it is visible
 *   against both states.
 *
 * The invalid styling is copied verbatim and is not cosmetic: a required switch
 * left off IS an error, and `aria-invalid` used to be passed in and styled
 * nowhere, so it looked identical to «off».
 */
function AuroraSwitch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:ring-3 focus-visible:ring-brand/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-brand data-[state=unchecked]:bg-input',
        'aria-invalid:border-destructive/50 aria-invalid:data-[state=unchecked]:bg-destructive/25',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export { AuroraSwitch };
