'use client';

import { forwardRef, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doiState, doiUrl, normalizeDoi } from '@/lib/doi';
import { fieldSurface, type FieldSize } from './field-surface';

/**
 * «Аврора»'s DOI field — a drop-in replacement for `components/ui/doi-input`.
 *
 * Uncontrolled like `AuroraIsbnInput`, so `{...register(name)}` keeps working.
 * A pasted doi.org link is accepted as-is: `normalizeDoi` strips the resolver
 * prefix when the value is read, so nobody has to edit what they copied out of
 * the publisher's page.
 *
 * Because a DOI has no check digit, a valid SHAPE proves very little. The one
 * useful thing the form can offer is a link that opens the paper, so the person
 * entering it — or the ННВ moderator reading it later — can confirm in a click.
 * That link is the reason this control is a stack and not just an input, and it
 * takes `--brand` here: `docs/aurora.md` §3 puts a link in the accent, and this
 * one is an invitation to leave the form, which is worth marking.
 */
const AuroraDoiInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'size'> & {
    defaultValue?: string;
    size?: FieldSize;
  }
>(({ className, onChange, defaultValue, size = 'default', ...props }, ref) => {
  const [value, setValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const state = doiState(value);
  const lg = size === 'lg';

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
          placeholder="Наприклад: 10.1038/s41586-021-03819-2"
          data-slot="input"
          aria-invalid={state === 'invalid' || props['aria-invalid']}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e);
          }}
          className={cn(
            fieldSurface(size, 'font-mono placeholder:font-sans'),
            lg ? 'pr-11' : 'pr-9',
            className
          )}
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

      {state === 'valid' && (
        <a
          href={doiUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand underline-offset-4 transition-colors hover:text-brand-strong hover:underline"
        >
          Відкрити {normalizeDoi(value)}
          <ExternalLink className="size-3" />
        </a>
      )}
      {state === 'partial' && (
        <p className="text-xs text-muted-foreground">
          Формат: 10.XXXX/… — можна вставити посилання doi.org
        </p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-destructive">
          Не схоже на DOI. Очікується 10.XXXX/… або посилання doi.org
        </p>
      )}
    </div>
  );
});

AuroraDoiInput.displayName = 'AuroraDoiInput';

export { AuroraDoiInput };
