'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
// «Аврора»'s select, not `components/ui`. This control sits beside the Аврора
// switch on the rating tab, and a shadcn trigger next to it is exactly the
// half-swapped look the redesign exists to end — the mock page is where the new
// design has to be COMPLETE, not nearly complete (owner, 2026-09-08).
//
// The names and the props are identical, so this is a path change and nothing
// else; the six screens that render a year picker all gain the new control.
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';

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
    // `relative`, and the spinner is placed INSIDE the trigger rather than after
    // it (owner, 2026-09-08). As a sibling it appeared out of nothing and pushed
    // whatever sat beside it — on the rating tab, the «незаповнені» switch —
    // sideways for as long as the year took to load. A control that moves the
    // furniture while it works is worse than one that says nothing.
    //
    // It can go inside without resizing anything because the trigger is a fixed
    // `w-28`: the spinner takes the chevron's own place, and the chevron fades
    // rather than unmounting, so the box never reflows.
    <div className="relative w-fit">
      <Select value={String(value)} onValueChange={onChange} disabled={pending}>
        <SelectTrigger
          aria-label="Рік"
          // `[&>svg]` is the trigger's own chevron — `SelectValue` renders a
          // span, so this reaches the icon and nothing else.
          className={cn('w-28', pending && '[&>svg]:opacity-0')}
          aria-busy={pending || undefined}
        >
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
      {pending && (
        <Loader2
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      )}
    </div>
  );
}
