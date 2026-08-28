'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * The rating year, on six screens (`/rating`, `/dashboard`, `/moderation`,
 * `/achievements`, a section, one person's rating tab).
 *
 * Changing it re-runs the whole page on the server — a year's worth of
 * activities, scores and rollups — which takes long enough that a select that
 * simply sat there reading the old year looked like it had ignored the click
 * (owner, 2026-08-28). `useTransition` gives the one thing that was missing:
 * `isPending` is true for exactly as long as the new page is being built.
 *
 * Same shape as `admin/domain-filter.tsx`, which navigates the same way.
 */
export function YearSelect({ years, value }: { years: number[]; value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (years.length <= 1) {
    return <span className="text-sm text-muted-foreground">{value} рік</span>;
  }

  function onChange(next: string) {
    if (next === String(value)) return;
    const params = new URLSearchParams(searchParams);
    params.set('year', next);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={String(value)} onValueChange={onChange} disabled={pending}>
        <SelectTrigger aria-label="Рік" className="w-28" aria-busy={pending || undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Beside the trigger rather than inside it: the Select owns its own
          content and a chevron, and greying out alone says «not now» without
          saying «working». */}
      {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  );
}
