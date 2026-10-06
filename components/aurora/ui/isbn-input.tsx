'use client';

import { forwardRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIsbn, isbnState, normalizeIsbn } from '@/lib/isbn';
import { fieldSurface, type FieldSize } from './field-surface';
import { ISBN_MASK, MaskGhost } from './mask-ghost';

/**
 * «Аврора»'s ISBN field — a drop-in replacement for
 * `components/ui/isbn-input`.
 *
 * **The mask is enforced** (owner, 2026-10-07), the way `OrcidInput` and
 * `TelInput` enforce theirs: digits only, thirteen at most, an `X` only where
 * an ISBN-10 puts its check character, and the hyphens are the mask's —
 * `formatIsbn` in `lib/isbn.ts` says why one fixed grouping loses nothing. It
 * was a drawn hint before, and accepted 22 digits and any letter.
 *
 * **Controlled, like `OrcidInput`** — a field that reformats as you type has
 * to own its value, so it is wired through a `Controller`, not `register`.
 *
 * The hint never shows an error while the number is still too short to judge.
 * Being told you are wrong halfway through typing is noise; Zod reports the
 * real failure on submit.
 *
 * The tick sits INSIDE the field rather than beside it, so the surface is
 * `fieldSurface()` on the input itself — the wrapper helper is for controls
 * like `TelInput` that print something to the left of the value.
 */
const IsbnInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'size' | 'value' | 'onChange' | 'defaultValue'> & {
    value: string | null | undefined;
    onChange: (next: string) => void;
    size?: FieldSize;
  }
>(({ className, onChange, value: raw, size = 'default', ...props }, ref) => {
  const value = formatIsbn(raw ?? '');
  const state = isbnState(value);
  const count = normalizeIsbn(value).length;
  const lg = size === 'lg';

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          {...props}
          ref={ref}
          value={value}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder={ISBN_MASK}
          data-slot="input"
          aria-invalid={state === 'invalid' || props['aria-invalid']}
          onChange={(e) => onChange(formatIsbn(e.target.value))}
          className={cn(
            fieldSurface(size, 'font-mono tabular-nums placeholder:text-transparent'),
            lg ? 'pr-11' : 'pr-9',
            className
          )}
        />
        {/* AFTER the input, not before it. This field carries its own fill from
            `.aurora-field`, so a ghost underneath would be painted over; the
            typed prefix is re-rendered invisibly, so nothing of the real value
            is covered and `pointer-events-none` keeps the caret reachable. */}
        <MaskGhost
          template={ISBN_MASK}
          typed={value}
          className={lg ? 'px-3.5 text-base' : 'px-2.5 text-base md:text-sm'}
        />
        {state === 'valid' && (
          <span
            className={cn(
              'absolute inset-y-0 right-0 flex items-center text-success',
              lg ? 'px-3.5' : 'px-2.5'
            )}
          >
            <Check className="size-4" />
          </span>
        )}
      </div>

      {state === 'partial' && (
        <p className="text-xs text-muted-foreground">
          {count} з 10 або 13 цифр — дефіси ставляться самі
        </p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-error">
          Контрольна цифра не збігається — перевірте, чи немає помилки
        </p>
      )}
    </div>
  );
});

IsbnInput.displayName = 'IsbnInput';

export { IsbnInput };
