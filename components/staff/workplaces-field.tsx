'use client';

import { useState } from 'react';
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
  // BOTH ROWS ARE ALWAYS THERE (owner, 2026-08-26). «додати кафедру» made an
  // empty row appear and a cleared one linger, so the card changed height as it
  // was used and it was never obvious whether a second кафедра existed or was
  // merely offered. Two is the maximum anyway, so showing two is the whole
  // truth: filled is a workplace, empty is not one.
  // THE ORDER ON SCREEN, which the storage cannot hold: it is a column plus an
  // array, so `toWorkplaces` has to reconstruct an order and puts the full-time
  // post first. Correct on open, wrong the instant somebody uses the switch —
  // turning a row full-time made it jump to the top under the cursor.
  const [order, setOrder] = useState<string[]>(() =>
    toWorkplaces({ departmentId, partTimeDepartmentIds }).map((w) => w.departmentId)
  );
  // Refusals this control makes itself — two full-time posts, one кафедра
  // twice. Separate from `error`, which comes from the schema on submit.
  const [problem, setProblem] = useState<string | null>(null);

  const saved = toWorkplaces({ departmentId, partTimeDepartmentIds });
  const byId = new Map(saved.map((w) => [w.departmentId, w]));
  // Whatever this control has seen, in the order it showed it; then anything
  // that arrived from elsewhere — a form reset, a кафедра set on another screen.
  const ordered: Workplace[] = [
    ...order.map((id) => byId.get(id)).filter((w): w is Workplace => w !== undefined),
    ...saved.filter((w) => !order.includes(w.departmentId)),
  ];
  // An empty row starts as «Основне» only when nothing else claims it, which is
  // the ordinary case: one кафедра, full-time.
  const rows: Workplace[] = [...ordered];
  while (rows.length < 2) {
    rows.push({ departmentId: '', isPartTime: rows.some((r) => !r.isPartTime) });
  }

  function commit(next: Workplace[]) {
    const refusal = workplaceProblem(next);
    setProblem(refusal);
    // A refused change is not applied — the row stays as it was and says why,
    // rather than being silently rewritten into something legal.
    if (refusal) return;

    // Remember the positions as they are on screen, before `toStorage` throws
    // the order away.
    setOrder(next.map((r) => r.departmentId).filter((id) => id !== ''));

    const storage = toStorage(next);
    onChange({
      departmentId: storage.departmentId ?? '',
      partTimeDepartmentIds: storage.partTimeDepartmentIds,
    });
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

              {/* «Основне», not «Сумісник» (owner, 2026-08-26). The switch asks
                  the positive question — is this the person's main post — so on
                  means yes and off means сумісництво, and the common case is the
                  one that reads as set rather than as missing. */}
              <label className="flex w-20 shrink-0 flex-col items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Основне</span>
                <Switch
                  checked={!row.isPartTime}
                  onCheckedChange={(next) => replace(index, { ...row, isPartTime: !next })}
                  disabled={disabled || row.departmentId === '' || !canEditPartTime}
                  className="data-[state=checked]:bg-green-600"
                  aria-label="Основне місце роботи"
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
      </div>
    </FormField>
  );
}
