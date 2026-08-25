'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ORCID_LENGTH, formatOrcid, orcidLength, orcidState } from '@/lib/orcid';

/**
 * An ORCID, and nothing else can be typed into it.
 *
 * The hyphens belong to the field, not to the value: they are put in as the
 * person types, so `0000000218250097` and `0000-0002-1825-0097` cannot both end
 * up in the column. Anything that is not a digit — or an `X` outside the last
 * place — never appears, rather than appearing and then being complained about.
 * A pasted `https://orcid.org/…` address is reduced to the identifier.
 *
 * **Controlled, like `TelInput` and unlike `IsbnInput`.** A field that reformats
 * on every keystroke cannot stay uncontrolled without the caret jumping, so call
 * it through a react-hook-form `Controller`.
 *
 * The value handed out is what is shown, fragment included. A partial must
 * survive the round trip — `TelInput` reported `null` below nine digits, which
 * came back empty and threw away every keystroke, so nothing could be typed at
 * all (2026-08-24). The schema refuses an incomplete ORCID on submit instead.
 *
 * The tick is a real check, not a length: an ORCID carries an ISO 7064 check
 * digit, so `0000-0002-1825-0097` is a person and `…0098` is nobody. The error
 * therefore only ever means «the digits do not add up» — the mask has already
 * made every other kind of wrong impossible.
 */
export function OrcidInput({
  value,
  onChange,
  disabled,
  id,
  className,
  'aria-invalid': ariaInvalid,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const shown = formatOrcid(value ?? '');
  const state = orcidState(shown);
  const count = orcidLength(shown);

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex h-9 items-center rounded-md border border-input bg-transparent pr-2 pl-3 shadow-xs',
          'focus-within:ring-1 focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
          (ariaInvalid || state === 'invalid') && 'border-destructive',
          className
        )}
      >
        <input
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={ariaInvalid || state === 'invalid'}
          placeholder="0000-0000-0000-0000"
          value={shown}
          onChange={(e) => onChange(formatOrcid(e.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:font-sans disabled:cursor-not-allowed"
        />
        {state === 'valid' && (
          <Check className="size-4 shrink-0 text-green-600 dark:text-green-500" />
        )}
      </div>

      {/* Only while something is half-typed. «16 цифр» to somebody who has typed
          nothing is an instruction; at 12 it is an answer to «why is there no
          tick yet». */}
      {state === 'partial' && (
        <p className="text-xs text-muted-foreground">
          {count} з {ORCID_LENGTH} цифр — можна вставити посилання на профіль
        </p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-destructive">
          Контрольна цифра не збігається — перевірте, чи немає помилки
        </p>
      )}
    </div>
  );
}
