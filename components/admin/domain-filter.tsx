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

/** Stands for «any domain». Not `''` — Radix reserves that for «no selection». */
const ALL = '__all__';

export interface DomainOption {
  domain: string;
  count: number;
  /** A `.invalid` placeholder: nothing can be delivered to it */
  undeliverable: boolean;
}

/**
 * Which email domain to write to, on /admin/invites.
 *
 * A plain `<Select>` on purpose. It borrowed `DepartmentSelect` when it was one
 * (2026-08-25) and stopped being able to the moment that became a searchable
 * кафедра combobox — but nothing is lost: there are two or three domains, and a
 * search box over three rows is furniture.
 *
 * The undeliverable group is named «Без адреси» rather than
 * `no-email.invalid`, which is a placeholder and not a domain anybody would
 * recognise, and tagged amber — the project's «needs attention», and here the
 * one group an ADMIN must not send to.
 */
export function DomainFilter({
  domains,
  value,
  basePath,
  extraParams,
  className,
}: {
  domains: readonly DomainOption[];
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value || ALL}
      disabled={pending}
      onValueChange={(next) => {
        if (next === value) return;
        const params = new URLSearchParams(extraParams);
        if (next !== ALL) params.set('domain', next);
        const query = params.toString();
        startTransition(() => router.push(query ? `${basePath}?${query}` : basePath));
      }}
    >
      <SelectTrigger className={className ?? 'w-full sm:w-56'} aria-label="Домен пошти">
        <SelectValue placeholder="Домен пошти" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Будь-яка пошта</SelectItem>
        {domains.map((d) => (
          <SelectItem key={d.domain} value={d.domain}>
            <span className="flex w-full items-center gap-2">
              <span className="truncate">{d.undeliverable ? 'Без адреси' : d.domain}</span>
              <span
                className={
                  d.undeliverable
                    ? 'ml-auto shrink-0 rounded bg-amber-500/10 px-1.5 py-px text-xs text-amber-700 tabular-nums dark:text-amber-500'
                    : 'ml-auto shrink-0 rounded bg-muted px-1.5 py-px text-xs text-muted-foreground tabular-nums'
                }
              >
                {d.count}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
