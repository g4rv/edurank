'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { DepartmentSelect } from '@/components/department-select';
import { planListHref, type PlanListParams } from '@/lib/science/list-params';
import { PLAN_STATES, PLAN_STATE_LABELS } from '@/lib/science/plan-rows';
import { cn } from '@/lib/utils';

/** Stands for «every факультет» / «будь-який стан». Not `''` — Radix reserves
 *  that for «no selection». */
const ANY = '__all__';

/**
 * The filter bar both plan lists wear.
 *
 * `/science-plans` offers all four controls; a завідувач with one кафедра gets
 * the search and the state alone, and a декан gets the кафедра picker as well —
 * hence the props rather than two components. Every control writes to the URL
 * and the server does the filtering, so a view is linkable and survives a
 * refresh.
 */
export function PlanFilters({
  basePath,
  params,
  faculties,
  departments,
}: {
  basePath: string;
  params: PlanListParams;
  /** Omit on a scoped list — a завідувач has no факультет to choose between. */
  faculties?: readonly { id: string; name: string }[];
  /** Omit where the caller oversees exactly one кафедра. */
  departments?: readonly { id: string; name: string; facultyId: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // **Uncontrolled**, like `StaffFilters`'s own search box. The box is the
  // source of truth while somebody types; the URL catches up a debounce later.
  // Mirroring the URL back into React state would mean a `setState` in an
  // effect, which the React Compiler's lint refuses — and rightly: it is a
  // render for every keystroke to re-tell the input what it already shows.
  //
  // `hasText` exists only so the «×» can come and go, and it is set from the
  // event handlers alone, never from an effect.
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(Boolean(params.q));

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (debounce.current && clearTimeout(debounce.current)), []);

  function go(href: string) {
    startTransition(() => router.push(href));
  }

  function search(value: string) {
    setHasText(value.length > 0);
    if (debounce.current) clearTimeout(debounce.current);
    // 300ms: long enough that «Іваненко» is one navigation rather than eight,
    // short enough that nobody wonders whether the box is working.
    debounce.current = setTimeout(() => {
      go(planListHref(basePath, params, { q: value.trim() || undefined }));
    }, 300);
  }

  function clear() {
    if (debounce.current) clearTimeout(debounce.current);
    if (inputRef.current) inputRef.current.value = '';
    setHasText(false);
    go(planListHref(basePath, params, { q: undefined }));
  }

  // Narrows the кафедра list to the chosen факультет, the same convenience
  // `components/rating/rating-filters.tsx` offers — a full 31-row list to
  // scroll past when the факультет already picked the right eight or so.
  const visibleDepartments = (departments ?? []).filter(
    (d) => !params.facultyId || d.facultyId === params.facultyId
  );

  // Carried across a кафедра change by `DepartmentSelect`, which builds its own
  // URL. `page` is deliberately absent: narrowing to one кафедра must land on
  // page one, not on page five of the list it replaced.
  const carry: Record<string, string> = {};
  if (params.q) carry.q = params.q;
  if (params.facultyId) carry.faculty = params.facultyId;
  if (params.state) carry.state = params.state;
  if (params.sort) carry.sort = params.sort;
  if (params.sort && params.dir === 'asc') carry.dir = 'asc';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          defaultValue={params.q ?? ''}
          onChange={(e) => search(e.target.value)}
          placeholder="Пошук за ПІБ"
          aria-label="Пошук за ПІБ"
          className="px-9"
        />
        {hasText && (
          <button
            type="button"
            onClick={clear}
            aria-label="Очистити пошук"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {faculties && faculties.length > 0 && (
        <Select
          value={params.facultyId || ANY}
          onValueChange={(value) =>
            go(
              planListHref(basePath, params, {
                faculty: value === ANY ? undefined : value,
                // A кафедра of the old факультет is not in the new one, so it
                // cannot survive the change — the rule `AllPlansView` already
                // followed.
                dept: undefined,
              })
            )
          }
        >
          <SelectTrigger className="w-full sm:w-64" aria-label="Факультет">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Всі факультети</SelectItem>
            {faculties.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {departments && departments.length > 1 && (
        <DepartmentSelect
          departments={visibleDepartments}
          value={params.departmentId ?? ''}
          basePath={basePath}
          param="dept"
          label="Кафедра"
          allowAll={{ label: 'Всі кафедри' }}
          extraParams={carry}
        />
      )}

      <Select
        value={params.state ?? ANY}
        onValueChange={(value) =>
          go(planListHref(basePath, params, { state: value === ANY ? undefined : value }))
        }
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Стан">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Будь-який стан</SelectItem>
          {PLAN_STATES.map((state) => (
            <SelectItem key={state} value={state}>
              {PLAN_STATE_LABELS[state]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Every control here navigates, and the list is a few hundred people
          re-read and re-sorted on the server — long enough that a filter which
          changed nothing on screen yet read as ignored (owner, 2026-08-28). */}
      <Loader2
        aria-hidden
        className={cn(
          'size-4 animate-spin text-muted-foreground transition-opacity',
          pending ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
