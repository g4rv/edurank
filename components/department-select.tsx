'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  DepartmentCombobox,
  type DepartmentComboboxOption,
} from '@/components/department-combobox';

export type DepartmentOption = DepartmentComboboxOption;

/**
 * Pick a кафедра, and go there.
 *
 * The thin URL half of `DepartmentCombobox`: the picker itself lives there and
 * is shared with the filters and the forms, so all six кафедра choosers in the
 * app search the same way. This one only turns a choice into a navigation.
 *
 * The URL stays the source of truth — the choice is linkable, survives a
 * refresh, and the server does the filtering. It began as a row of one link per
 * кафедра, became a `<Select>` when an ADMIN started seeing all thirty-one, and
 * is now a combobox for the same reason the select replaced the links: at this
 * length, finding a name is a scan rather than a choice.
 */
export function DepartmentSelect({
  departments,
  value,
  basePath,
  param = 'department',
  label = 'Кафедра',
  extraParams,
  className,
  allowAll,
}: {
  departments: readonly DepartmentOption[];
  value: string;
  basePath: string;
  param?: string;
  /** Screen-reader name for the field; the visible text is the кафедра */
  label?: string;
  allowAll?: { label: string };
  /**
   * Query params to carry across the switch. Without this, changing кафедра on
   * /stakes silently dropped `?tab=sandbox` and dumped ADMIN back on the real
   * distribution.
   */
  extraParams?: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={className ?? 'w-full sm:w-72'} aria-label={label}>
      <DepartmentCombobox
        departments={departments}
        value={value}
        allowAll={allowAll}
        placeholder={label}
        disabled={pending}
        onChange={(next) => {
          if (next === value) return;
          const params = new URLSearchParams(extraParams);
          if (next) params.set(param, next);
          const query = params.toString();
          startTransition(() => {
            router.push(query ? `${basePath}?${query}` : basePath);
          });
        }}
      />
    </div>
  );
}
