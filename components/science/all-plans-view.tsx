'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { DepartmentSelect } from '@/components/department-select';
import { EmptyState } from '@/components/aurora/ui/card';
import { StatStrip, type Stat } from '@/components/dashboard/stat-strip';
import { DepartmentPlansTable, isShort } from '@/components/science/department-plans-table';
import type { SciencePlanRowSummary } from '@/lib/queries/list-science-plans';

const full = new Intl.NumberFormat('uk-UA');

/** Stands for «every факультет». Not `''` — Radix reserves that for «no selection». */
const ALL_FACULTIES = '__all__';

/**
 * ADMIN/ННВ's university-wide read of наукова робота plans — every кафедра,
 * filtered by факультет and/or кафедра. Task 10's `DepartmentPlansTable` is
 * reused as-is (`showDepartment` is exactly what it was built for); this file
 * only adds the filters and the summary strip around it.
 *
 * **Filters never lose each other** (rule 3, owner 2026-09-15): picking a
 * кафедра keeps `?faculty=` in the URL — `DepartmentSelect`'s `extraParams`
 * carries it forward — while picking a факультет clears `?dept=`, because the
 * old choice may no longer belong to the new факультет. The server resolves
 * which is authoritative (a кафедра wins outright over a факультет, never
 * ANDed against it) — see the comment in `page.tsx`.
 */
export function AllPlansView({
  rows,
  faculties,
  departments,
  facultyId,
  departmentId,
}: {
  rows: readonly SciencePlanRowSummary[];
  faculties: readonly { id: string; name: string }[];
  departments: readonly { id: string; name: string; facultyId: string }[];
  /** `''` = every факультет */
  facultyId: string;
  /** `''` = every кафедра */
  departmentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Narrows the кафедра list to the chosen факультет, the same convenience
  // `components/rating/rating-filters.tsx` offers — a full 31-row list to
  // scroll past when the факультет already picked the right eight or so.
  const visibleDepartments = facultyId
    ? departments.filter((d) => d.facultyId === facultyId)
    : departments;

  const hasPlanCount = rows.filter((r) => r.hasPlan).length;
  const shortCount = rows.filter(isShort).length;
  // Deliberately not styled as a warning (rule 4, owner 2026-09-15): on the
  // real database this is 306 of 328 — most розподіли happen later in the
  // year than plans do, and that is the ordinary shape of the data, not a
  // problem to flag.
  const noRateCount = rows.filter((r) => r.rateHundredths === null).length;

  const stats: Stat[] = [
    { label: 'Усього позицій', value: full.format(rows.length) },
    { label: 'Мають план', value: full.format(hasPlanCount) },
    { label: 'Під ціллю', value: full.format(shortCount) },
    { label: 'Без ставки', value: full.format(noRateCount) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={facultyId || ALL_FACULTIES}
          disabled={pending}
          onValueChange={(next) => {
            if (next === (facultyId || ALL_FACULTIES)) return;
            const params = new URLSearchParams();
            // A факультет change clears `dept` outright — the кафедра that was
            // chosen may not even belong to the new факультет.
            if (next !== ALL_FACULTIES) params.set('faculty', next);
            const query = params.toString();
            startTransition(() =>
              router.push(query ? `/science-plans?${query}` : '/science-plans')
            );
          }}
        >
          <SelectTrigger aria-label="Факультет" className="w-full sm:w-64">
            <SelectValue placeholder="Факультет" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FACULTIES}>Всі факультети</SelectItem>
            {faculties.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DepartmentSelect
          departments={visibleDepartments}
          value={departmentId}
          basePath="/science-plans"
          param="dept"
          label="Кафедра"
          allowAll={{ label: 'Всі кафедри' }}
          // Carries `?faculty=` forward — see the file comment above.
          extraParams={facultyId ? { faculty: facultyId } : undefined}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState>За обраним фільтром нікого не знайдено.</EmptyState>
      ) : (
        <>
          <StatStrip stats={stats} />
          <DepartmentPlansTable rows={[...rows]} showDepartment />
        </>
      )}
    </div>
  );
}
