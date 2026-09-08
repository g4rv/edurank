'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NATIONAL_LENGTH,
  PHONE_PLACEHOLDER,
  formatNational,
  fromStoredPhone,
  nationalDigits,
  toPhoneValue,
} from '@/lib/phone';
import { fieldSurfaceInner, fieldSurfaceWrapper, type FieldSize } from './field-surface';

/**
 * «Аврора»'s phone field — a drop-in replacement for `components/ui/tel-input`.
 *
 * **The behaviour is copied verbatim and none of it is cosmetic.** Every line
 * of it is a bug somebody reported from the screen:
 *
 * - `+380` is printed inside the field, not typed, so the country code cannot
 *   be got wrong, forgotten, or written five different ways.
 * - The value handed out keeps the FRAGMENT. Reporting `null` below nine digits
 *   came back as an empty string and threw away every keystroke, so nothing
 *   could be typed at all (2026-08-24).
 * - The `swallowed` hint answers the field emptying itself when somebody types
 *   the code that is already printed to their left (2026-08-31).
 * - **Autofill is off**, because this field usually holds somebody else's
 *   number — see the attributes on the input.
 *
 * What changes is the surface. The old one was `border-input bg-transparent`
 * with a grey `ring-1`, and — because it is a WRAPPER — it also had
 * `opacity-50` for disabled, the thing `docs/aurora.md` §7 forbids. It now
 * takes `fieldSurfaceWrapper()`, which is why that helper exists: the box holds
 * the surface and the ring follows the input inside it, so the whole control
 * lights up rather than just the text.
 */
export function TelInput({
  value,
  onChange,
  disabled,
  id,
  size = 'default',
  className,
  'aria-invalid': ariaInvalid,
}: {
  /** «+380441234567», or «+38044» while it is being typed, or empty */
  value: string | null | undefined;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  size?: FieldSize;
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const digits = fromStoredPhone(value);
  const complete = digits.length === NATIONAL_LENGTH;
  const shown = formatNational(digits);

  /** Something was typed and none of it survived — «0», «+», or «380». */
  const [swallowed, setSwallowed] = useState(false);

  return (
    <div className="space-y-1">
      <div
        aria-invalid={ariaInvalid}
        className={cn(fieldSurfaceWrapper(size, 'gap-1.5'), className)}
      >
        {/* Part of the field, not of the value. Nobody can delete it, so no
            number can be stored without a country code. */}
        <span className="shrink-0 text-muted-foreground select-none">+380</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          // No autofill (owner, 2026-09-07). This field is on /staff/[id]/edit
          // far more often than on «Мій профіль», and there it holds SOMEBODY
          // ELSE's number — so the browser offering the signed-in admin's own
          // is not a convenience, it is a wrong number one keystroke away from
          // being saved onto a colleague's record.
          //
          // The three attributes are one job between them: Chrome ignores
          // `autocomplete="off"` on a field it recognises as a phone, and the
          // two `data-` hints are what LastPass and 1Password read — neither
          // looks at `autocomplete` at all.
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore
          disabled={disabled}
          aria-invalid={ariaInvalid}
          placeholder={PHONE_PLACEHOLDER}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value;
            const next = nationalDigits(raw);
            setSwallowed(next.length === 0 && /\d/.test(raw));
            onChange(toPhoneValue(next));
          }}
          className={cn(fieldSurfaceInner, 'tabular-nums')}
        />
        {complete && <Check className="size-4 shrink-0 text-green-600 dark:text-green-500" />}
      </div>
      {/* Only while something is half-typed. Saying «9 цифр» to somebody who has
          typed nothing is an instruction; saying it at 4 digits is an answer to
          «why is this not accepted». */}
      {digits.length > 0 && !complete && (
        <p className="text-xs text-muted-foreground">
          {digits.length} з {NATIONAL_LENGTH} цифр
        </p>
      )}
      {digits.length === 0 && swallowed && (
        <p className="text-xs text-muted-foreground">
          Код +380 вже вказано — введіть {NATIONAL_LENGTH} цифр номера
        </p>
      )}
    </div>
  );
}
