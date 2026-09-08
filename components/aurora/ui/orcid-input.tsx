'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ORCID_LENGTH, formatOrcid, orcidLength, orcidState } from '@/lib/orcid';
import { fieldSurfaceInner, fieldSurfaceWrapper, type FieldSize } from './field-surface';
import { MaskGhost, ORCID_MASK } from './mask-ghost';

/**
 * «Аврора»'s ORCID field — a drop-in replacement for
 * `components/ui/orcid-input`.
 *
 * Behaviour verbatim: the hyphens belong to the field and not to the value, so
 * `0000000218250097` and `0000-0002-1825-0097` cannot both end up in the
 * column; a pasted `https://orcid.org/…` address is reduced to the identifier;
 * a partial survives the round trip, for the reason spelled out on
 * `TelInput`.
 *
 * The tick is a real check, not a length — an ORCID carries an ISO 7064 check
 * digit — so the error only ever means «the digits do not add up». The mask has
 * already made every other kind of wrong impossible.
 *
 * The surface is `fieldSurfaceWrapper()`, replacing a grey `ring-1` and the
 * `opacity-50` disabled state. Two things that are NOT just the surface:
 *
 * - **The mask is drawn** — `____-____-____-____` behind the value, so what is
 *   still missing is visible while you type. It replaces a `0000-0000-0000-0000`
 *   placeholder that looked like a value already in the box. See `MaskGhost`.
 * - **The invalid state shows the destructive ring**, not only the border,
 *   because the wrapper carries `aria-invalid` itself — before, an ORCID whose
 *   checksum failed changed one hairline and nothing else.
 */
export function OrcidInput({
  value,
  onChange,
  disabled,
  id,
  size = 'default',
  className,
  'aria-invalid': ariaInvalid,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  size?: FieldSize;
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const shown = formatOrcid(value ?? '');
  const state = orcidState(shown);
  const count = orcidLength(shown);
  const invalid = ariaInvalid || state === 'invalid';

  return (
    <div className="space-y-1">
      <div aria-invalid={invalid} className={cn(fieldSurfaceWrapper(size, 'gap-1.5'), className)}>
        {/* The ghost is positioned against this span, not against the padded
            wrapper, so it needs no padding of its own to stay aligned. */}
        <span className="relative flex h-full min-w-0 flex-1 items-center">
          <input
            id={id}
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={invalid}
            placeholder={ORCID_MASK}
            value={shown}
            onChange={(e) => onChange(formatOrcid(e.target.value))}
            className={cn(fieldSurfaceInner, 'font-mono tabular-nums placeholder:text-transparent')}
          />
          <MaskGhost
            template={ORCID_MASK}
            typed={shown}
            className={size === 'lg' ? 'text-base' : 'text-base md:text-sm'}
          />
        </span>
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
