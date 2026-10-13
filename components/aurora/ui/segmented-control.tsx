'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A two-or-three-way choice drawn as one bar — «Підвищення кваліфікації /
 * Стажування», not a yes/no.
 *
 * **Not a `Switch`.** A switch is on or off; it has no names for its two states,
 * and a reader has to guess which side is which. This names every option, the way
 * the tab bar names every tab, and wears the same look: the chosen segment takes
 * `--brand` (§3), the bar is `bg-card` on the wash (§1).
 *
 * A radio group underneath — arrow keys move between segments, one tab stop —
 * so it is a form control to a keyboard and a screen reader, not a row of
 * buttons.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
  'aria-label': ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, step: 1 | -1) {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('flex w-full gap-1 rounded-lg border bg-card p-1 shadow-xs', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            // One tab stop for the group, on the chosen segment.
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              }
            }}
            className={cn(
              'flex h-8 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none',
              'disabled:pointer-events-none disabled:text-muted-foreground',
              checked
                ? 'bg-brand text-brand-foreground shadow-sm'
                : 'text-foreground hover:bg-brand/10 hover:text-brand-strong'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
