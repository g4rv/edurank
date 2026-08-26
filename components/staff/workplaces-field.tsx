'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DepartmentCombobox } from '@/components/department-combobox';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { formatStake } from '@/lib/stake/units';
import { toStorage, toWorkplaces, workplaceProblem, type Workplace } from '@/lib/staff/workplaces';

export type DepartmentOption = {
  id: string;
  name: string;
  faculty?: { name: string } | null;
};

export type StakePart = { departmentId: string; hundredths: number };

/**
 * «Місця роботи» — every кафедра a person holds a post on, and on what terms.
 *
 * REPLACES «Основна кафедра» + «Додаткова кафедра» (owner's sketch,
 * 2026-08-26). Those were two different controls for one fact, and they could
 * not say the thing the university actually needed: сумісництво is a part-time
 * POST, not «a second кафедра», so somebody whose main job is elsewhere holds
 * part-time posts and a full-time one nowhere. Two rows of the same shape can
 * say that; a «main» field and an «extra» field cannot.
 *
 * Controlled and presentational. It knows nothing about how this is stored —
 * `lib/staff/workplaces.ts` converts, and the form owns the values.
 */
export function WorkplacesField({
  departments,
  breakdown,
  departmentId,
  partTimeDepartmentIds,
  onChange,
  disabled = false,
  canEditPartTime = true,
  error,
}: {
  departments: readonly DepartmentOption[];
  /** What each кафедра allocated. `null` on the CREATE form — nobody to pay yet. */
  breakdown: StakePart[] | null;
  departmentId: string;
  partTimeDepartmentIds: string[];
  onChange: (next: { departmentId: string; partTimeDepartmentIds: string[] }) => void;
  disabled?: boolean;
  /**
   * May this viewer touch сумісництво? A division not granted
   * `partTimeDepartmentIds` sees the posts and changes none of them — the
   * server would drop the change, and a control that collects a choice it
   * then throws away is worse than no control.
   */
  canEditPartTime?: boolean;
  /** The schema's own complaint, e.g. «НПП повинен мати кафедру» */
  error?: { message?: string };
}) {
  // An empty row somebody asked for and has not filled in yet. It cannot live
  // in the form values: `toStorage` drops a кафедра-less row on purpose, so it
  // would vanish the moment it was added.
  const [addedRow, setAddedRow] = useState(false);
  // Refusals this control makes itself — two full-time posts, one кафедра
  // twice. Separate from `error`, which comes from the schema on submit.
  const [problem, setProblem] = useState<string | null>(null);

  const saved = toWorkplaces({ departmentId, partTimeDepartmentIds });
  const rows: Workplace[] =
    saved.length > 0 ? [...saved] : [{ departmentId: '', isPartTime: false }];
  const hasFullTime = rows.some((r) => r.departmentId !== '' && !r.isPartTime);
  if (addedRow && rows.length < 2) rows.push({ departmentId: '', isPartTime: hasFullTime });

  function commit(next: Workplace[]) {
    const refusal = workplaceProblem(next);
    setProblem(refusal);
    // A refused change is not applied — the row stays as it was and says why,
    // rather than being silently rewritten into something legal.
    if (refusal) return;

    const storage = toStorage(next);
    onChange({
      departmentId: storage.departmentId ?? '',
      partTimeDepartmentIds: storage.partTimeDepartmentIds,
    });
    if (next.every((r) => r.departmentId !== '')) setAddedRow(false);
  }

  const replace = (index: number, row: Workplace) =>
    commit(rows.map((r, i) => (i === index ? row : r)));

  return (
    <FormField error={problem ? { message: problem } : error}>
      <div className="space-y-4">
        {rows.map((row, index) => {
          // Clearing a кафедра is how a workplace is removed — the row stays on
          // screen, empty, and is simply not saved. There is no separate delete
          // button because there is nothing else a row could mean when empty.
          const selected = departments.find((d) => d.id === row.departmentId);
          const takenElsewhere = rows
            .filter((_, i) => i !== index)
            .map((r) => r.departmentId)
            .filter(Boolean);
          const part = breakdown?.find((p) => p.departmentId === row.departmentId);

          return (
            <div key={index} className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <span className="mb-1.5 block text-xs text-muted-foreground">Кафедра</span>
                <DepartmentCombobox
                  departments={departments.filter((d) => !takenElsewhere.includes(d.id))}
                  value={row.departmentId}
                  onChange={(next) => replace(index, { ...row, departmentId: next })}
                  disabled={disabled || (row.isPartTime && !canEditPartTime)}
                  clearable
                />
                {selected?.faculty?.name && (
                  <p
                    className="mt-1 truncate text-xs text-muted-foreground"
                    title={selected.faculty.name}
                  >
                    {selected.faculty.name}
                  </p>
                )}
              </div>

              {/* Amber when on, matching the «Сумісник» pill this same person
                  carries in the ставки grid. Not green/red: green means
                  «verified» and red means «error» everywhere else here, and a
                  part-time post is neither. */}
              <label className="flex w-20 shrink-0 flex-col items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Сумісник</span>
                <Switch
                  checked={row.isPartTime}
                  onCheckedChange={(next) => replace(index, { ...row, isPartTime: next })}
                  disabled={disabled || row.departmentId === '' || !canEditPartTime}
                  className="data-[state=checked]:bg-amber-500"
                  aria-label={`Сумісник на цій кафедрі`}
                />
              </label>

              {/* Set on /stakes/[id] by the кафедра's завідувач, never typed
                  here — two writers on one number is what let the профіль and
                  the розподіл disagree. */}
              {breakdown !== null && (
                <div className="flex w-24 shrink-0 flex-col items-end gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Ставка</span>
                  {part ? (
                    <span className="text-sm font-medium">{formatStake(part.hundredths)}</span>
                  ) : (
                    <span
                      className="text-sm text-muted-foreground"
                      title="Завідувач ще не розподілив ставки цієї кафедри"
                    >
                      —
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {rows.length < 2 && !disabled && canEditPartTime && (
          <button
            type="button"
            onClick={() => setAddedRow(true)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-4" />
            додати кафедру
          </button>
        )}
      </div>
    </FormField>
  );
}
