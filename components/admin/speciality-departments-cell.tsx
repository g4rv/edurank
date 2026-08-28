'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { DepartmentCombobox } from '@/components/department-combobox';
import {
  linkSpecialityDepartment,
  unlinkSpecialityDepartment,
} from '@/app/(dashboard)/admin/stakes/actions';

/**
 * Which кафедри graduate one спеціальність — the ADMIN's half of
 * `SpecialityDepartment`.
 *
 * A chip per link with an ×, and a combobox offering only кафедри not already
 * linked. Six спеціальності have two owner кафедри, so adding is not replacing.
 *
 * Errors render under the cell rather than as a toast: the convention is that
 * feedback appears as close to its cause as possible, and here there is an
 * obvious element to attach it to.
 */
export function SpecialityDepartmentsCell({
  specialityId,
  linked,
  allDepartments,
}: {
  specialityId: string;
  linked: readonly { id: string; name: string }[];
  allDepartments: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const linkedIds = new Set(linked.map((d) => d.id));
  const available = allDepartments.filter((d) => !linkedIds.has(d.id));

  function run(action: typeof linkSpecialityDepartment, departmentId: string) {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('specialityId', specialityId);
      form.set('departmentId', departmentId);
      const result = await action(null, form);
      if (result && 'error' in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {linked.map((d) => (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {d.name}
            <button
              type="button"
              aria-label={`Прибрати ${d.name}`}
              disabled={pending}
              onClick={() => run(unlinkSpecialityDepartment, d.id)}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {linked.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
      </div>

      {available.length > 0 && (
        <DepartmentCombobox
          departments={available}
          value=""
          onChange={(next) => next && run(linkSpecialityDepartment, next)}
          placeholder="Додати кафедру…"
          disabled={pending}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
