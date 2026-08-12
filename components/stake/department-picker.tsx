'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Which кафедра is on screen — ADMIN only.
 *
 * The кафедра lives in the URL rather than in state, so the page stays
 * server-rendered, a link to one кафедра keeps working, and the browser's back
 * button walks the кафедри the way it walked them.
 *
 * A plain `<select>`: forty кафедри is too many for a row of tabs and too few
 * to justify a combobox with a search field.
 */
export function DepartmentPicker({
  departments,
  value,
  tab,
}: {
  departments: readonly { id: string; name: string; faculty: string }[];
  value: string;
  /** Carried across the switch, so changing кафедра keeps you in the sandbox */
  tab?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The current tab comes in as a prop rather than out of `useSearchParams`,
  // which would put a Suspense requirement on a page that has no other reason
  // for one.
  function pick(id: string) {
    const query = tab ? `?d=${id}&tab=${tab}` : `?d=${id}`;
    startTransition(() => router.push(`/stakes${query}`));
  }

  return (
    <select
      aria-label="Кафедра"
      value={value}
      disabled={pending}
      onChange={(e) => pick(e.target.value)}
      className="h-9 max-w-md min-w-64 rounded-md border bg-card px-3 text-sm shadow-xs transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
    >
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name} — {d.faculty}
        </option>
      ))}
    </select>
  );
}
