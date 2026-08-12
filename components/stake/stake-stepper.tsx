'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { STAKE_STEP, formatStake } from '@/lib/stake/units';
import { cn } from '@/lib/utils';

/**
 * ▲▼ beside a ставка field.
 *
 * Every editable ставка on the grid moves in 0.05 and every one of them is
 * typed with a decimal comma into a narrow box, so the buttons are not a
 * convenience — they are the only way to change a value without risking a
 * typo. «Розподілено» had them and Мін/Макс did not, which made the two columns
 * look like different kinds of field when they are the same kind.
 *
 * Bounds are optional. A floor always has one; a ceiling usually does not,
 * because the ceiling is the thing being raised.
 */
export function StakeStepper({
  value,
  onChange,
  disabled,
  min,
  max,
  step = STAKE_STEP,
  label,
}: {
  /** In hundredths */
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Named in the aria-label, e.g. «ставку для Коваленко І. П.» */
  label: string;
}) {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  const amount = formatStake(step);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-label={`Збільшити ${label} на ${amount}`}
        disabled={disabled || atMax}
        onClick={() => onChange(value + step)}
        className={BUTTON}
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Зменшити ${label} на ${amount}`}
        disabled={disabled || atMin}
        onClick={() => onChange(value - step)}
        className={BUTTON}
      >
        <ChevronDown className="size-3.5" />
      </button>
    </div>
  );
}

const BUTTON = cn(
  'rounded px-1 text-muted-foreground transition-colors',
  'hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'
);
