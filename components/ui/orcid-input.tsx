'use client';

import { forwardRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orcidLength, orcidState } from '@/lib/orcid';

/**
 * ORCID field with a live check-digit hint.
 *
 * Uncontrolled, like `IsbnInput` and `PassInput`, so `{...register(name)}` keeps
 * working — the mirrored state exists only to drive the hint. Nothing is
 * rewritten as the person types: they may paste the whole `https://orcid.org/…`
 * address, and silently eating half of what they pasted is worse than accepting
 * it. `normaliseOrcid` reduces it to the identifier when it is displayed, and
 * the Zod schema accepts either form.
 *
 * The hint never reports an error while the value is still too short to judge.
 * Being told you are wrong halfway through typing sixteen digits is noise; the
 * resolver says so on submit, once.
 *
 * Why a checksum and not just a shape: an ORCID carries an ISO 7064 check
 * digit, so `0000-0002-1825-0097` is a person and `…0098` is nobody. A
 * length-only test accepts both, and a wrong link on somebody's profile is the
 * mistake this field exists to stop.
 */
const OrcidInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'> & { defaultValue?: string }
>(({ className, onChange, defaultValue, ...props }, ref) => {
  const [value, setValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const state = orcidState(value);
  const count = orcidLength(value);

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          {...props}
          ref={ref}
          defaultValue={defaultValue}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="0000-0000-0000-0000"
          data-slot="input"
          aria-invalid={state === 'invalid' || props['aria-invalid']}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e);
          }}
          className={cn(
            'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-9 font-mono text-base transition-colors outline-none placeholder:font-sans focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80',
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
          {count} з 16 цифр — дефіси не враховуються. Можна вставити посилання на профіль
        </p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-destructive">
          Не схоже на ORCID — перевірте, чи немає помилки в цифрах
        </p>
      )}
    </div>
  );
});

OrcidInput.displayName = 'OrcidInput';

export { OrcidInput };
