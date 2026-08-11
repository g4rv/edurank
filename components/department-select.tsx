'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Pick a кафедра, and go there.
 *
 * Replaces a row of one link per department. That worked while a person saw two
 * or three of them; an ADMIN sees every кафедра in the university, and sixteen
 * buttons wrapping over three lines pushed the actual table off the screen and
 * made finding one name a scan rather than a choice.
 *
 * The URL stays the source of truth — the choice is still a navigation, so it
 * is linkable, survives a refresh, and the server does the filtering. Only the
 * control changed.
 */
export function DepartmentSelect({
  departments,
  value,
  basePath,
  param = 'department',
  label = 'Кафедра',
}: {
  departments: { id: string; name: string }[];
  value: string;
  basePath: string;
  param?: string;
  /** Screen-reader name for the trigger; the visible text is the department */
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        if (next === value) return;
        startTransition(() => {
          router.push(`${basePath}?${param}=${next}`);
        });
      }}
    >
      <SelectTrigger className="w-full sm:w-72" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
