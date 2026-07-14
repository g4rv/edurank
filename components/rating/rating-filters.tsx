'use client';

import { useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  faculties: { id: string; name: string }[];
  departments: { id: string; name: string; facultyId: string }[];
};

export function RatingFilters({ faculties, departments }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const facultyId = searchParams.get('faculty') ?? '';
  const departmentId = searchParams.get('dept') ?? '';

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => push({ q: value || undefined }), 400);
  }

  const visibleDepts = facultyId
    ? departments.filter((d) => d.facultyId === facultyId)
    : departments;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Пошук за ПІБ…"
        defaultValue={q}
        onChange={(e) => handleSearch(e.target.value)}
        className="h-8 w-64 text-sm"
      />

      <Select
        key={facultyId || '__faculty_reset__'}
        value={facultyId || undefined}
        onValueChange={(v) => push({ faculty: v === '__all__' ? undefined : v, dept: undefined })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Факультет" />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="__all__">Всі факультети</SelectItem>
          {faculties.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        key={departmentId || '__dept_reset__'}
        value={departmentId || undefined}
        onValueChange={(v) => push({ dept: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Кафедра" />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="__all__">Всі кафедри</SelectItem>
          {visibleDepts.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
