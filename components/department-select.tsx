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
import { cn } from '@/lib/utils';

export interface DepartmentOption {
  id: string;
  name: string;
  /**
   * A short figure shown as a tag after the name — on /stakes, the кафедра's
   * `Кст`. The faculty used to sit here and earned its width poorly: it repeats
   * across every кафедра of one faculty and is already on the line below.
   */
  tag?: string | null;
  /**
   * Amber when the tag reports something still to be done — «без Кст» is the
   * project's «pending / needs attention», the same hue as an unactivated
   * account. Grey otherwise.
   */
  tagTone?: 'muted' | 'warn';
}

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
  extraParams,
  className,
}: {
  departments: DepartmentOption[];
  value: string;
  basePath: string;
  param?: string;
  /** Screen-reader name for the trigger; the visible text is the department */
  label?: string;
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
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        if (next === value) return;
        const params = new URLSearchParams({ ...extraParams, [param]: next });
        startTransition(() => {
          router.push(`${basePath}?${params}`);
        });
      }}
    >
      <SelectTrigger className={className ?? 'w-full sm:w-72'} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            <span className="flex w-full items-center gap-2">
              <span className="truncate">{d.name}</span>
              {d.tag && (
                <span
                  className={cn(
                    'ml-auto shrink-0 rounded px-1.5 py-px text-xs tabular-nums',
                    d.tagTone === 'warn'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {d.tag}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
