'use client';

import { useState } from 'react';
import { DepartmentCombobox } from '@/components/department-combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/aurora/ui/input';
import { Switch } from '@/components/aurora/ui/switch';
import { cn } from '@/lib/utils';
import { formatStake } from '@/lib/stake/units';
import { toStorage, toWorkplaces, workplaceProblem, type Workplace } from '@/lib/staff/workplaces';

export type DepartmentOption = {
  id: string;
  name: string;
  faculty?: { name: string } | null;
};

export type StakePart = { departmentId: string; hundredths: number };

/**
 * `Label`'s own look, on a `<span>`.
 *
 * These three name controls that carry no id to point a real `<label for>` at —
 * the кафедра picker is a combobox, «Ставка» is a read-only figure — and an
 * empty `<label>` is announced as labelling nothing, which is worse than a
 * plain caption. What matters here is that they MATCH «Відділ» below them: they
 * were `text-xs text-muted-foreground`, so one card carried two label styles
 * and the кафедра rows read as the lesser of the two (owner, 2026-09-07).
 */
const ROW_LABEL = 'mb-1.5 block text-sm leading-none font-medium';

/**
 * The band a row's control sits in — `h-8`, the height of the кафедра picker.
 *
 * Everything in a row then shares one centre line. Without it a 20px switch and
 * a 32px select share their TOP edge instead, and the eye lines up centres.
 */
const ROW_CONTROL = 'flex h-8 items-center';

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
  canEditPrimary = true,
  error,
  rates,
  onRateChange,
  canEditRates = false,
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
  /**
   * May this viewer change the FULL-TIME post? A division granted
   * `partTimeDepartmentIds` but not `departmentId` may place somebody on a
   * second кафедра and must not move their main one — so the two rows are
   * gated separately (2026-08-27). Disabling the whole control on one missing
   * grant would take away the edit they do hold.
   */
  canEditPrimary?: boolean;
  /** The schema's own complaint, e.g. «НПП повинен мати кафедру» */
  error?: { message?: string };
  /**
   * The ставка typed for each кафедра, keyed by `departmentId`.
   *
   * Only ADMIN gets these boxes, and only for a кафедра that has not allocated
   * this person anything — `breakdown` is what says which have. Typing is
   * therefore impossible where a завідувач has already decided, which is the
   * rule `seedAllocations` enforces again on the server.
   */
  rates?: Record<string, string>;
  onRateChange?: (departmentId: string, value: string) => void;
  /**
   * May this viewer type a ставка at all — ADMIN, and only while a rating year
   * is open. An allocation lives in a year; with none active there is nowhere
   * for the number to go, so the box is disabled rather than accepting a value
   * the save would refuse.
   */
  canEditRates?: boolean;
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
  // An empty row NEVER reacts to the other one. It used to start as «Основне»
  // whenever no other row claimed it, so turning the first switch off flipped
  // the empty second row on by itself — a control moving without being touched
  // (owner, 2026-08-26).
  //
  // Deterministic instead: a person with nothing yet gets «Основне» on the
  // first row, since one full-time кафедра is the ordinary case. Once anything
  // is filled in, an empty row is сумісництво and stays there until somebody
  // says otherwise.
  const rows: Workplace[] = [...ordered];
  while (rows.length < 2) {
    rows.push({ departmentId: '', isPartTime: !(ordered.length === 0 && rows.length === 0) });
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

  function replace(index: number, row: Workplace) {
    const next = rows.map((r, i) => (i === index ? row : r));

    // Turning «Основне» on turns the other one off, rather than refusing with
    // «Основне місце роботи може бути лише одне». Clicking the second switch
    // means «this one is the main post now» — the error told somebody to go
    // and undo the first one before they were allowed to say it. Only one full
    // time post can exist, so the switches behave as one choice, not two.
    if (!row.isPartTime && row.departmentId !== '') {
      return commit(next.map((r, i) => (i === index ? r : { ...r, isPartTime: true })));
    }
    return commit(next);
  }

  return (
    <FormField error={problem ? { message: problem } : error}>
      <div className="space-y-3">
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
            <div key={index} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {/* A real `Label`, like «Відділ» under it. These three were
                    `text-xs text-muted-foreground` — captions rather than
                    labels — so one card held two different label styles and the
                    кафедра rows read as less important than the відділ below
                    them (owner, 2026-09-07). */}
                <span className={ROW_LABEL}>Кафедра</span>
                <DepartmentCombobox
                  departments={departments.filter((d) => !takenElsewhere.includes(d.id))}
                  value={row.departmentId}
                  onChange={(next) => replace(index, { ...row, departmentId: next })}
                  disabled={disabled || (row.isPartTime ? !canEditPartTime : !canEditPrimary)}
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
              <label className="flex w-16 shrink-0 flex-col">
                <span className={cn(ROW_LABEL, 'text-center')}>Основне</span>
                {/* `h-8` is the height of the кафедра control beside it, so the
                    switch sits on its middle line rather than at its top. A
                    20px switch and a 32px select share a top edge and look
                    misaligned, because the eye lines up centres (owner,
                    2026-09-07). */}
                <span className={ROW_CONTROL + ' justify-center'}>
                  <Switch
                    checked={!row.isPartTime}
                    onCheckedChange={(next) => replace(index, { ...row, isPartTime: !next })}
                    // Flipping this rewrites `departmentId` AND
                    // `partTimeDepartmentIds`, so it takes both grants.
                    disabled={
                      disabled || row.departmentId === '' || !canEditPartTime || !canEditPrimary
                    }
                    aria-label="Основне місце роботи"
                  />
                </span>
              </label>

              {/* **Typed until the завідувач decides, read-only after** (owner,
                  2026-09-21).

                  A кафедра that has allocated this person something shows that
                  number and nothing else: the split belongs to the head, and an
                  ADMIN who could retype it here would make «завідувач
                  розподіляє» untrue. One that has not is a кафедра nobody has
                  spread yet, and somebody has to be able to say what a new hire
                  was taken on at — that is what this box is, and it is the only
                  place a ставка is entered by hand.

                  Empty until a кафедра is chosen, because a ставка with no
                  кафедра has nowhere to be written. */}
              {(breakdown !== null || canEditRates) && (
                <div className="flex w-20 shrink-0 flex-col">
                  <span className={cn(ROW_LABEL, 'text-right')}>Ставка</span>
                  <span className={ROW_CONTROL + ' justify-end'}>
                    {part ? (
                      <span
                        className="text-sm font-medium tabular-nums"
                        title="Розподілено завідувачем — змінюється на сторінці розподілу"
                      >
                        {formatStake(part.hundredths)}
                      </span>
                    ) : canEditRates ? (
                      <Input
                        value={rates?.[row.departmentId] ?? ''}
                        onChange={(e) => onRateChange?.(row.departmentId, e.target.value)}
                        disabled={disabled || row.departmentId === ''}
                        placeholder="0,00"
                        inputMode="decimal"
                        aria-label="Ставка"
                        className="text-right tabular-nums"
                      />
                    ) : (
                      <span
                        className="text-sm text-muted-foreground"
                        title="Завідувач ще не розподілив ставки цієї кафедри"
                      >
                        —
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FormField>
  );
}
