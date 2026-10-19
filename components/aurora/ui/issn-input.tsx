'use client';

import { forwardRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIssn, issnState, normalizeIssn } from '@/lib/issn';
import { fieldSurface, type FieldSize } from './field-surface';
import { ISSN_MASK, MaskGhost } from './mask-ghost';

/**
 * «Аврора»'s ISSN field — the journal's number, `1234-567X`.
 *
 * Built exactly like `IsbnInput`, its sibling: the mask is ENFORCED (digits, an
 * `X` only as the eighth character, the hyphen is the mask's), it is controlled
 * through a `Controller`, and the hint stays quiet until the number is long
 * enough to judge. `lib/issn.ts` has the check digit.
 */
const IssnInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'size' | 'value' | 'onChange' | 'defaultValue'> & {
    value: string | null | undefined;
    onChange: (next: string) => void;
    size?: FieldSize;
  }
>(({ className, onChange, value: raw, size = 'default', ...props }, ref) => {
  const value = formatIssn(raw ?? '');
  const state = issnState(value);
  const count = normalizeIssn(value).length;
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
          placeholder={ISSN_MASK}
          data-slot="input"
          aria-invalid={state === 'invalid' || props['aria-invalid']}
          onChange={(e) => onChange(formatIssn(e.target.value))}
          className={cn(
            fieldSurface(size, 'font-mono tabular-nums placeholder:text-transparent'),
            lg ? 'pr-11' : 'pr-9',
            className
          )}
        />
        <MaskGhost
          template={ISSN_MASK}
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
        <p className="text-xs text-muted-foreground">{count} з 8 символів — дефіс ставиться сам</p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-error">
          Контрольна цифра не збігається — перевірте, чи немає помилки
        </p>
      )}
    </div>
  );
});

IssnInput.displayName = 'IssnInput';

export { IssnInput };
