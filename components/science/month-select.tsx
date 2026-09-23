'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { monthLabel, monthOptions } from '@/lib/science/execution-month';

/**
 * «Місяць виконання» — D41. The options ARE the D42 window: this month and
 * `lookbackMonths` before it, newest first, so a month the server would refuse
 * is never offered. The server checks again.
 *
 * `extra` keeps a work's stored month selectable when it has fallen out of the
 * window — the edit form must be able to show what is saved, and
 * `updateWorkEvidence` accepts an unchanged month.
 */
export function MonthSelect({
  id,
  value,
  onChange,
  lookbackMonths,
  extra,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  lookbackMonths: number;
  extra?: string;
  disabled?: boolean;
}) {
  // Computed once per mount — a dialog left open over midnight on the 1st must
  // not reshuffle its own list under the cursor.
  const [options] = useState(() => {
    const window = monthOptions(new Date(), lookbackMonths);
    return extra && !window.includes(extra) ? [...window, extra] : window;
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Оберіть місяць" />
      </SelectTrigger>
      <SelectContent>
        {options.map((key) => (
          <SelectItem key={key} value={key}>
            {monthLabel(key)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
