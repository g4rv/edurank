import Link from 'next/link';
import { Card, CardTitle, EmptyState } from '@/components/aurora/ui/card';
import { cn } from '@/lib/utils';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import type { PlanTarget } from '@/lib/science/target';
import type { SciencePlanRowDetail } from '@/lib/queries/get-science-plan';
import { PlanTotal } from '@/components/science/plan-total';
import { formatHours } from '@/lib/science/hours';
import { AddPlanRowDialog, type PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { DeletePlanRowButton } from '@/components/science/delete-plan-row-button';

/**
 * The кафедра switcher, the target band and the list of planned rows — the
 * whole body of `/science-plan` once the guard clauses in `page.tsx` have
 * passed.
 *
 * Kept a server component: the only interactive pieces are the add dialog and
 * each row's delete button, both already client components of their own, the
 * same split `AchievementsList` / `DeleteActivityButton` uses.
 */
export function PlanView({
  departments,
  currentDepartmentId,
  rows,
  target,
  workTypes,
}: {
  departments: { id: string; name: string }[];
  currentDepartmentId: string;
  rows: SciencePlanRowDetail[];
  target: PlanTarget;
  workTypes: PlanWorkType[];
}) {
  const workTypeById = new Map(workTypes.map((t) => [t.id, t]));

  return (
    <div className="space-y-5">
      {departments.length > 1 && (
        <DepartmentSwitcher departments={departments} currentDepartmentId={currentDepartmentId} />
      )}

      <PlanTotal target={target} />

      <div className="flex items-center justify-between gap-3">
        <CardTitle>План</CardTitle>
        <AddPlanRowDialog departmentId={currentDepartmentId} workTypes={workTypes} />
      </div>

      {rows.length === 0 ? (
        <EmptyState>Ще немає запланованих робіт.</EmptyState>
      ) : (
        <Card padding="none">
          <ul className="divide-y">
            {rows.map((row) => {
              const summary = summarizeEvidence(
                workTypeById.get(row.workTypeId)?.fields ?? [],
                row.details
              );
              return (
                <li key={row.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-base">
                        <span className="mr-1.5 text-foreground-soft">{row.itemNumber}</span>
                        {row.workTypeLabel}
                      </p>
                      {summary && <p className="mt-0.5 text-sm text-foreground-soft">{summary}</p>}
                      {row.note && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{row.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-foreground-soft">
                        Годин:{' '}
                        <span className="text-base font-semibold text-foreground tabular-nums">
                          {formatHours(row.plannedHundredths)}
                        </span>
                      </span>
                      <DeletePlanRowButton rowId={row.id} label={row.workTypeLabel} />
                    </div>
                  </div>
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
}: {
  departments: { id: string; name: string }[];
  currentDepartmentId: string;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs">
      {departments.map((d) => {
        const active = d.id === currentDepartmentId;
        return (
          <Link
            key={d.id}
            href={`/science-plan?dept=${d.id}`}
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
