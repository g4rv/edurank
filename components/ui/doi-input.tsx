'use client';

import { forwardRef, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doiState, doiUrl, normalizeDoi } from '@/lib/doi';

/**
 * DOI field. Uncontrolled like IsbnInput and PassInput so `{...register(name)}`
 * keeps working; the mirrored state only drives the hint.
 *
 * A pasted doi.org link is accepted as-is — normalizeDoi strips the resolver
 * prefix when the value is read, so the user never has to edit what they
 * copied out of the publisher's page.
 *
 * Because a DOI has no check digit, a valid shape proves very little. The one
 * useful thing the form can offer is a link that opens the paper, so the person
 * entering it — or the ННВ moderator reading it later — can confirm in a click.
 */
const DoiInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'> & { defaultValue?: string }
>(({ className, onChange, defaultValue, ...props }, ref) => {
  const [value, setValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const state = doiState(value);

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

      {state === 'valid' && (
        <a
          href={doiUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
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

DoiInput.displayName = 'DoiInput';

export { DoiInput };
