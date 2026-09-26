'use client';

import { useState } from 'react';
import { DateRangeInput } from '@/components/aurora/ui/date-range-input';
import { FormField } from '@/components/ui/form-field';
import { executionWindow } from '@/lib/science/execution-month';

/**
 * «Період виконання» — when a work was done, by month (D48/D49).
 *
 * The shared `DateRangeInput` in its month mode: one click is a one-month
 * work, two clicks a work that took several months. The hours always count in
 * ONE month — the last (owner, 2026-09-23); the first is a recorded fact, never
 * used to split hours, since 100 год over three months would be 33,33… a month.
 *
 * Shows the whole навчальний рік (September → its last month) and lets the
 * person click up to the current month. The server checks both ends again, and
 * that the start is before the finish.
 */
export function ExecutionPeriodField({
  id,
  academicYear,
  lastMonth,
  finished,
  started,
  onChange,
}: {
  id: string;
  academicYear: string;
  /** The year's last month (1–8), from the template. */
  lastMonth: number;
  /** The month the hours count in, `"YYYY-MM"`, or `''` before a pick. */
  finished: string;
  /** The first month of a several-month work, or `null`. */
  started: string | null;
  onChange: (next: { finished: string; started: string | null }) => void;
}) {
  // Frozen for the life of the dialog — one left open over midnight on the
  // 1st must not move its own bounds under the cursor.
  const [window] = useState(() => executionWindow(new Date(), academicYear, lastMonth));

  return (
    <FormField
      htmlFor={id}
      label="Період виконання"
      required
      description={
        started
          ? 'Години зараховуються в останній місяць періоду.'
          : `Оберіть місяць, або два — якщо робота тривала кілька місяців. У межах ${academicYear} навчального року.`
      }
    >
      <DateRangeInput
        id={id}
        granularity="month"
        min={window.first}
        max={window.upTo ?? undefined}
        // Before September the year has no month to pick yet; the server
        // refuses any month then too.
        disabled={!window.upTo}
        showUntil={window.last}
        value={
          finished ? { from: started ?? finished, to: started ? finished : undefined } : undefined
        }
        onChange={(range) =>
          onChange(
            !range?.from
              ? { finished: '', started: null }
              : !range.to || range.to === range.from
                ? { finished: range.from, started: null }
                : { finished: range.to, started: range.from }
          )
        }
      />
    </FormField>
  );
}
