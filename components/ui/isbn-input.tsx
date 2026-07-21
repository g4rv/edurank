'use client';

import { forwardRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isbnState, normalizeIsbn } from '@/lib/isbn';

/**
 * ISBN field with a live check-digit hint.
 *
 * Uncontrolled, like PassInput, so `{...register(name)}` keeps working — the
 * mirrored state exists only to drive the hint. Nothing is rewritten as the
 * user types: hyphenation styles differ between publishers, so the entered
 * form is kept and the checksum simply ignores separators.
 *
 * The hint never shows an error while the number is still too short to judge;
 * being told you are wrong halfway through typing is noise. Zod reports the
 * real failure on submit.
 */
const IsbnInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'> & { defaultValue?: string }
>(({ className, onChange, defaultValue, ...props }, ref) => {
  const [value, setValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const state = isbnState(value);
  const count = normalizeIsbn(value).length;

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
          placeholder="978-3-16-148410-0"
          data-slot="input"
          aria-invalid={state === 'invalid' || props['aria-invalid']}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e);
          }}
          className={cn(
            'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-9 font-mono text-base transition-colors outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80',
            className
          )}
        />
        {state === 'valid' && (
          <span className="absolute inset-y-0 right-0 flex items-center px-2.5 text-green-600">
            <Check className="size-4" />
          </span>
        )}
      </div>

      {state === 'partial' && (
        <p className="text-xs text-muted-foreground">
          {count} з 10 або 13 цифр — дефіси та пробіли не враховуються
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
