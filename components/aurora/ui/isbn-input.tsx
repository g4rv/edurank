'use client';

import { forwardRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isbnState, normalizeIsbn } from '@/lib/isbn';
import { fieldSurface, type FieldSize } from './field-surface';
import { ISBN_MASK, MaskGhost } from './mask-ghost';

/**
 * «Аврора»'s ISBN field — a drop-in replacement for
 * `components/ui/isbn-input`.
 *
 * **Uncontrolled, like `PassInput` and unlike `TelInput`**, so
 * `{...register(name)}` keeps working. The mirrored state exists only to drive
 * the hint; nothing is rewritten as the user types, because hyphenation styles
 * differ between publishers — the entered form is kept and the checksum simply
 * ignores separators.
 *
 * The hint never shows an error while the number is still too short to judge.
 * Being told you are wrong halfway through typing is noise; Zod reports the
 * real failure on submit.
 *
 * The tick sits INSIDE the field rather than beside it, so the surface is
 * `fieldSurface()` on the input itself — the wrapper helper is for controls
 * like `TelInput` that print something to the left of the value.
 *
 * **The mask is drawn, and it is a hint about LENGTH only.** `000-0-00-000000-0`
 * shows thirteen digits and roughly where the breaks fall, replacing a
 * «Наприклад: 978-3-16-148410-0» placeholder that vanished the moment anyone
 * typed. It is not enforced and could not be: an ISBN's hyphens depend on the
 * registration group and the publisher, so a Ukrainian book usually splits
 * `978-966-…` where the example splits `978-3-…`, and an ISBN-10 has ten digits
 * and a different shape again. The ghost therefore keeps the mask under
 * whatever is typed and never rewrites it — see `ISBN_MASK`. The example moved
 * into the hint line, where it survives being typed over.
 */
const IsbnInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'size'> & {
    defaultValue?: string;
    size?: FieldSize;
  }
>(({ className, onChange, defaultValue, size = 'default', ...props }, ref) => {
  const [value, setValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const state = isbnState(value);
  const count = normalizeIsbn(value).length;
  const lg = size === 'lg';

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          {...props}
          ref={ref}
          defaultValue={defaultValue}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder={ISBN_MASK}
          data-slot="input"
          aria-invalid={state === 'invalid' || props['aria-invalid']}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e);
          }}
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
              'absolute inset-y-0 right-0 flex items-center text-green-600 dark:text-green-500',
              lg ? 'px-3.5' : 'px-2.5'
            )}
          >
            <Check className="size-4" />
          </span>
        )}
      </div>

      {state === 'partial' && (
        <p className="text-xs text-muted-foreground">
          {count} з 10 або 13 цифр — дефіси розставляйте як у книзі, вони не враховуються.
          Наприклад: 978-3-16-148410-0
        </p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-destructive">
          Контрольна цифра не збігається — перевірте, чи немає помилки
        </p>
      )}
    </div>
  );
});

IsbnInput.displayName = 'IsbnInput';

export { IsbnInput };
