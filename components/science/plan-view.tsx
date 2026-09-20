import Link from 'next/link';
import { Card, EmptyState } from '@/components/aurora/ui/card';
import { cn } from '@/lib/utils';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { formatHours } from '@/lib/science/hours';
import type { PlanTarget } from '@/lib/science/target';
import type { SciencePlanRecordDetail, SciencePlanRowDetail } from '@/lib/queries/get-science-plan';
import { PlanTotal } from '@/components/science/plan-total';
import { AddPlanRowDialog, type PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { AddRecordDialog } from '@/components/science/add-record-dialog';
import { DeletePlanRowButton } from '@/components/science/delete-plan-row-button';
import { RecordList } from '@/components/science/record-list';
import { RecordTabs, type PlanTab } from '@/components/science/record-tabs';
import { LockPlanButton } from '@/components/science/lock-plan-button';

/**
 * The кафедра switcher, the target band, the two tabs and whichever list the
 * tab names — the whole body of `/science-plan` once the guard clauses in
 * `page.tsx` have passed.
 *
 * Kept a server component: the only interactive pieces are the two dialogs and
 * each row's delete button, all of them client components already — the same
 * split `AchievementsList` / `DeleteActivityButton` uses.
 */
export function PlanView({
  departments,
  currentDepartmentId,
  tab,
  rows,
  records,
  target,
  workTypes,
  lockedAt,
}: {
  departments: { id: string; name: string }[];
  currentDepartmentId: string;
  tab: PlanTab;
  rows: SciencePlanRowDetail[];
  records: SciencePlanRecordDetail[];
  target: PlanTarget;
  workTypes: PlanWorkType[];
  /** Submitted — the plan is fixed and recording has opened. */
  lockedAt: Date | null;
}) {
  const workTypeById = new Map(workTypes.map((t) => [t.id, t]));

  // What a record may say it fulfils. Built from the plan rows so the picker
  // can only ever offer this person's own intentions — the server checks it
  // again, because a list is not a permission.
  const locked = lockedAt !== null;

  // План and факт are compared as HOURS, broken down by пункт (owner,
  // 2026-09-17) — no record is tied to a plan line, so the пункт number is what
  // relates the two. APPROVED only: a declined record stops counting at once.
  const doneByItem = new Map<string, number>();
  for (const record of records) {
    if (record.status !== 'APPROVED') continue;
    doneByItem.set(
      record.itemNumber,
      (doneByItem.get(record.itemNumber) ?? 0) + record.hoursHundredths
    );
  }

  // Grouped the way Додаток III itself is numbered.
  //
  // By a MAP, not by consecutive runs: rows arrive in the order they were
  // typed, so planning п.1, then п.8, then п.1 again produced two «Пункт 1»
  // groups — a duplicate React key and the same пункт stated twice with two
  // different totals (owner, 2026-09-17). Sorted numerically for the same
  // reason the наказ is: «12» belongs after «8», not between «1» and «8».
  const byItem = new Map<string, SciencePlanRowDetail[]>();
  for (const row of rows) {
    const existing = byItem.get(row.itemNumber);
    if (existing) existing.push(row);
    else byItem.set(row.itemNumber, [row]);
  }
  const groups = [...byItem.entries()]
    .map(([itemNumber, itemRows]) => ({ itemNumber, rows: itemRows }))
    .sort((a, b) => Number(a.itemNumber) - Number(b.itemNumber));

  return (
    <div className="space-y-5">
      {departments.length > 1 && (
        <DepartmentSwitcher
          departments={departments}
          currentDepartmentId={currentDepartmentId}
          tab={tab}
        />
      )}

      <PlanTotal target={target} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RecordTabs
          active={tab}
          departmentId={currentDepartmentId}
          planCount={rows.length}
          doneCount={records.length}
          doneLocked={!locked}
        />
        {tab === 'plan' ? (
          locked ? (
            // Nothing to press: a submitted plan has no add button and no
            // delete on its rows.
            <p className="text-sm text-foreground-soft">
              План збережено {lockedAt.toLocaleDateString('uk-UA')} — зміни через ННВ
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <LockPlanButton
                departmentId={currentDepartmentId}
                rows={rows.map((row) => ({
                  id: row.id,
                  label: row.note?.trim()
                    ? `${row.workTypeLabel} — ${row.note.trim()}`
                    : row.workTypeLabel,
                  hoursHundredths: row.plannedHundredths,
                }))}
                totalHundredths={target.plannedHundredths}
                targetHundredths={target.targetHundredths}
                hasRate={target.rateHundredths !== null}
              />
              <AddPlanRowDialog departmentId={currentDepartmentId} workTypes={workTypes} />
            </div>
          )
        ) : (
          <AddRecordDialog departmentId={currentDepartmentId} workTypes={workTypes} />
        )}
      </div>

      {tab === 'done' ? (
        <RecordList records={records} workTypes={workTypes} />
      ) : rows.length === 0 ? (
        <EmptyState>Ще немає запланованих робіт.</EmptyState>
      ) : (
        <Card padding="none">
          <ul className="divide-y">
            {groups.map((group) => {
              const planned = group.rows.reduce((sum, r) => sum + r.plannedHundredths, 0);
              const done = doneByItem.get(group.itemNumber) ?? 0;
              return (
                <li key={group.itemNumber} className="px-5 py-3">
                  {/* Not `flex-wrap`: «Участь у конкурсі проєктів та
                      науково-технічних розробок…» is a full line, and wrapping
                      dropped the figures underneath it, where they read as
                      belonging to the row below (owner, 2026-09-17). The label
                      wraps inside its own column instead. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 text-base">
                      <span className="mr-1.5 text-foreground-soft">Пункт {group.itemNumber}</span>
                      {group.rows[0].workTypeLabel}
                    </p>
                    <p className="shrink-0 text-sm whitespace-nowrap text-foreground-soft">
                      Заплановано{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatHours(planned)}
                      </span>{' '}
                      · Виконано{' '}
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          done >= planned ? 'text-success' : 'text-foreground'
                        )}
                      >
                        {formatHours(done)}
                      </span>{' '}
                      год
                    </p>
                  </div>

                  <ul className="mt-1.5 space-y-1">
                    {group.rows.map((row) => {
                      const summary = summarizeEvidence(
                        workTypeById.get(row.workTypeId)?.fields ?? [],
                        row.details
                      );
                      return (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 text-foreground-soft">
                            {/* `||`, not `??`. A FIXED вид роботи (гурток,
                                лабораторія) declares no evidence fields, so
                                `summarizeEvidence` returns an empty string —
                                which `??` passed straight through, drawing a
                                row that showed «400 год» and nothing else. */}
                            {summary || row.workTypeLabel}
                            {row.note && (
                              <span className="text-muted-foreground"> — {row.note}</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-foreground-soft tabular-nums">
                              {formatHours(row.plannedHundredths)} год
                            </span>
                            {!locked && (
                              <DeletePlanRowButton rowId={row.id} label={row.workTypeLabel} />
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * Two links styled as `StaffTabs`'s own tab bar, not a dropdown — there are at
 * most two кафедри a person plans on (D6), so this is a choice between two,
 * not a list. `bg-card` on the wash, not a darker fill (§1's separation rule),
 * and the active one takes `--brand` (§3: it marks the active tab).
 */
function DepartmentSwitcher({
  departments,
  currentDepartmentId,
  tab,
}: {
  departments: { id: string; name: string }[];
  currentDepartmentId: string;
  tab: PlanTab;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs">
      {departments.map((d) => {
        const active = d.id === currentDepartmentId;
        return (
          <Link
            key={d.id}
            // The tab is carried across, or switching кафедра from «Виконано»
            // would silently drop somebody back onto «План».
            href={`/science-plan?dept=${d.id}${tab === 'done' ? '&tab=done' : ''}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-brand text-brand-foreground shadow-sm'
                : 'text-foreground hover:bg-brand/10 hover:text-brand-strong'
            )}
          >
            {d.name}
          </Link>
        );
      })}
    </div>
  );
}
