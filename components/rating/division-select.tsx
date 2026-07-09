'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ADMIN-only picker on the division data page: editors always see their own division
export function DivisionSelect({
  divisions,
  value,
}: {
  divisions: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set('division', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Відділ" className="w-72">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {divisions.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
