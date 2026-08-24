'use client';

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

/**
 * A Ukrainian phone number, and nothing else can be typed into it.
 *
 * `+380` is printed inside the field rather than typed, so the country code
 * cannot be got wrong, forgotten, or written five different ways. What the
 * person types is reduced to digits and regrouped as they go — «44 123 45 67» —
 * so a wrong character never appears at all instead of being reported later.
 *
 * **Controlled, unlike the other inputs here.** `IsbnInput` and friends stay
 * uncontrolled because they never rewrite what was typed; this one reformats on
 * every keystroke, which an uncontrolled input cannot do without the caret
 * jumping. Call it through a react-hook-form `Controller`.
 *
 * The value handed out is the stored form — «+380441234567» — or `null` while
 * the number is incomplete. A fragment is never stored: a number that cannot be
 * dialled is not worth keeping, and the field says so with the counter rather
 * than with an error nobody asked for yet.
 */
export function TelInput({
  value,
  onChange,
  disabled,
  id,
  className,
  'aria-invalid': ariaInvalid,
}: {
  /** «+380441234567», or «+38044» while it is being typed, or empty */
  value: string | null | undefined;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const digits = fromStoredPhone(value);
  const complete = digits.length === NATIONAL_LENGTH;
  const shown = formatNational(digits);

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex h-9 items-center rounded-md border border-input bg-transparent pr-2 pl-3 shadow-xs',
          'focus-within:ring-1 focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
          ariaInvalid && 'border-destructive',
          className
        )}
      >
        {/* Part of the field, not of the value. Nobody can delete it, so no
            number can be stored without a country code. */}
        <span className="mr-1.5 shrink-0 text-sm select-none">+380</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          disabled={disabled}
          aria-invalid={ariaInvalid}
          placeholder={PHONE_PLACEHOLDER}
          value={shown}
          // The field renders what it last reported, so a PARTIAL has to
          // survive that round trip. It first reported null below nine digits,
          // which came back as an empty string and threw away every keystroke —
          // nothing could be typed at all (2026-08-24, reported from the
          // screen). The schema refuses the fragment on submit instead.
          onChange={(e) => onChange(toPhoneValue(nationalDigits(e.target.value)))}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
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
    </div>
  );
}
