'use client';

import { useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { DepartmentCombobox } from '@/components/department-combobox';

type Props = {
  faculties: { id: string; name: string }[];
  departments: { id: string; name: string; facultyId: string }[];
};

/**
 * «Рейтинг НПП» — ПІБ, факультет, кафедра.
 *
 * Built on `staff-filters.tsx`, which is the filter bar every other list in the
 * app copies. Three things came from reading it rather than from this file's
 * own history:
 *
 * - **The кафедра is a combobox, not a `<Select>`.** There are fifty-four of
 *   them. `department-select.tsx` records why the app switched: «at this
 *   length, finding a name is a scan rather than a choice». This screen was
 *   still opening a fifty-four row menu with no search in it.
 * - **The search box carries its magnifier**, like every other search in the
 *   app, and sizes `min-w-40 flex-1` up to a `max-w` instead of a fixed `w-64`.
 * - **No `h-8` and no `text-sm` on the input.** Both come from the field
 *   surface, and a `text-sm` here undoes the `text-base md:text-sm` that stops
 *   iOS zooming a focused field — §4 of `docs/aurora.md`.
 *
 * Every filter is a URL param: the server does the narrowing over ~330 rows,
 * and a filtered view stays linkable and survives a reload.
 */
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

  // Choosing a факультет narrows the кафедри under it; the кафедра itself is
  // cleared at the same time, or a stale one would filter the list to nobody.
  const visibleDepts = facultyId
    ? departments.filter((d) => d.facultyId === facultyId)
    : departments;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative max-w-72 min-w-40 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Пошук за ПІБ…"
          defaultValue={q}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Пошук за ПІБ"
          className="pl-9"
        />
      </div>

      {/* **`flex-1`, the same as the кафедра beside it** (owner, 2026-09-21). It
          was a fixed `w-56` while the кафедра flexed, so on a wide screen one
          grew and the other did not and the pair read as two different kinds of
          control. They are the same kind: both hold a name that is a sentence —
          «Факультет соціальних наук, бізнесу та адміністрування» is 53
          characters — so both take an equal share of what the search box's
          `max-w` leaves.

          The `min-w` is what stops a select sizing to its CONTENT, which is the
          real hazard here: without it, choosing a long факультет grows the
          trigger and slides every control to its right along with it, and a
          filter bar must not rearrange itself when you use it. */}
      <div className="min-w-56 flex-1">
        <Select
          key={facultyId || '__faculty_reset__'}
          value={facultyId || undefined}
          onValueChange={(v) => push({ faculty: v === '__all__' ? undefined : v, dept: undefined })}
        >
          <SelectTrigger className="w-full">
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
      </div>

      {/* Same floor and the same `flex-1` as the факультет above, so the two
          stay equal at every width. */}
      <div className="min-w-56 flex-1">
        <DepartmentCombobox
          departments={visibleDepts}
          value={departmentId}
          allowAll={{ label: 'Всі кафедри' }}
          placeholder="Кафедра"
          onChange={(next) => push({ dept: next || undefined })}
        />
      </div>
    </div>
  );
}
