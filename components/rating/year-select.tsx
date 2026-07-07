'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function YearSelect({ years, value }: { years: number[]; value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (years.length <= 1) {
    return <span className="text-sm text-muted-foreground">{value} рік</span>;
  }

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set('year', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={String(value)} onValueChange={onChange}>
      <SelectTrigger aria-label="Рік" className="w-28">
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
  );
}
