'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/aurora/ui/input';

/**
 * Search by name for «Перевірка профілів». The text lives in the URL (`?q=`),
 * like the other filters, so a narrowed list is a link and the run buttons and
 * the Excel export act on exactly what is shown. Typing waits 400 ms before it
 * navigates, as on /staff; the other filters in the URL are kept.
 */
export function ProfileCheckSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending navigation must not fire after the page is gone
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function onChange(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value.trim()) sp.set('q', value.trim());
      else sp.delete('q');
      const query = sp.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 400);
  }

  return (
    <div className="relative max-w-72 min-w-40 flex-1">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        placeholder="Пошук за ПІБ…"
        defaultValue={initial}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Пошук за ПІБ"
        className="pl-9"
      />
    </div>
  );
}
