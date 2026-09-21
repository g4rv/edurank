import { Badge } from '@/components/aurora/ui/badge';
import {
  SortHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/aurora/ui/table';
import { formatStake } from '@/lib/stake/units';
import { formatHours } from '@/lib/science/hours';
import { planListHref, type PlanListParams } from '@/lib/science/list-params';
import { nextDir, type PlanSortField } from '@/lib/science/plan-rows';
import type { SciencePlanRowSummary } from '@/lib/queries/list-science-plans';
import { UnlockPlanButton } from '@/components/science/unlock-plan-button';

// Wide enough for the HEADING, not just the figure. «Заплановано» and
// «Виконано» are 11 and 8 characters plus a sort chevron, and at `6ch` they
// ran into each other and into «Бракує» — three headings with no gap between
// them, on a 1920px screen. The ПІБ column gives up the room: it was taking
// 900px to draw a 30-character name.
const FIGURE_COLUMN = 'calc(7ch + 2rem)';
const PLANNED_COLUMN = 'calc(11ch + 2rem)';
const DEPARTMENT_COLUMN = '14rem';
const STATE_COLUMN = '13rem';
const ACTION_COLUMN = '8rem';

/**
 * This list's sort heading — `href`, and nothing else.
 *
 * The drawing moved into `components/aurora/ui/table.tsx` when `/staff` wanted
 * the same thing, which is exactly what the note that used to stand here said
 * would happen: «the second screen that wants this is what moves it». What is
 * left is this screen's URL, which is its own — `planListHref` and `nextDir`
 * know about плани and the staff list's `buildHref` does not.
 */
function PlanSortHead({
  label,
  column,
  params,
  basePath,
  numeric = false,
  className,
}: {
  label: string;
  column: PlanSortField;
  params: PlanListParams;
  basePath: string;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <SortHead
      label={label}
      href={planListHref(basePath, params, {
        sort: column,
        dir: nextDir(params.sort, params.dir, column),
      })}
      active={params.sort === column}
      dir={params.dir}
      numeric={numeric}
      className={className}
    />
  );
}

/**
 * Who on a кафедра has planned their наукова робота, and who has not.
 *
 * No edit path lives here — see the owner's note on Task 10: this screen only
 * ever answers «may I look», the same split `scopeOf` / `headOf` draw
 * everywhere else in the app. Rows arrive filtered, sorted and paged by the
 * page; this draws them.
 */
export function DepartmentPlansTable({
  rows,
  showDepartment,
  params,
  basePath,
  canUnlock = false,
}: {
  rows: readonly SciencePlanRowSummary[];
  showDepartment: boolean;
  params: PlanListParams;
  basePath: string;
  /**
   * ННВ and ADMIN may reopen a submitted plan (owner, 2026-09-20) — the
   * remedy the screen has always promised the НПП and never had. Off by
   * default, so `/my-department/science-plans` stays what it is: a завідувач
   * and a декан READ their кафедра, they do not decide about it.
   *
   * A flag on a table is not a permission — `unlockPlan` re-checks.
   */
  canUnlock?: boolean;
}) {
  const columns = [
    null,
    ...(showDepartment ? [DEPARTMENT_COLUMN] : []),
    FIGURE_COLUMN,
    FIGURE_COLUMN,
    PLANNED_COLUMN,
    PLANNED_COLUMN,
    FIGURE_COLUMN,
    STATE_COLUMN,
    ...(canUnlock ? [ACTION_COLUMN] : []),
  ];

  return (
    // `fill`, not the component's default cap: the cap is an estimate of the
    // furniture above the table, and above this one there is a crumb, a title,
    // a filter bar, a stat strip and a pager — four rems more than the estimate
    // allows, which left the PAGE scrolling as well as the rows. See the note
    // on `fill` in `components/aurora/ui/table.tsx`.
    <Table
      fill
      // The floor is for the phone, where the header, four stacked filters and
      // a two-row strip leave `fill` almost nothing to hand over. Below it the
      // page scrolls again — which is the right answer on a 400px screen, and
      // the wrong one on a desktop, where `fill` has plenty to give.
      containerClassName="min-h-96"
      columns={columns}
      head={
        <TableRow>
          <PlanSortHead label="ПІБ" column="name" params={params} basePath={basePath} />
          {showDepartment && (
            <PlanSortHead label="Кафедра" column="department" params={params} basePath={basePath} />
          )}
          <PlanSortHead label="Ставка" column="rate" params={params} basePath={basePath} numeric />
          <PlanSortHead label="Ціль" column="target" params={params} basePath={basePath} numeric />
          <PlanSortHead
            label="Заплановано"
            column="planned"
            params={params}
            basePath={basePath}
            numeric
          />
          <PlanSortHead
            label="Виконано"
            column="done"
            params={params}
            basePath={basePath}
            numeric
          />
          <PlanSortHead
            label="Бракує"
            column="shortfall"
            params={params}
            basePath={basePath}
            numeric
          />
          <TableHead>Стан</TableHead>
          {canUnlock && <TableHead align="right">Дії</TableHead>}
        </TableRow>
      }
    >
      <TableBody className="[&_td]:align-middle">
        {rows.map((row) => (
          <TableRow key={`${row.staffId}-${row.departmentId}`}>
            <TableCell>{row.fullName}</TableCell>
            {showDepartment && <TableCell muted>{row.departmentName}</TableCell>}
            <TableCell numeric>
              {row.rateHundredths === null ? '—' : formatStake(row.rateHundredths)}
            </TableCell>
            {/* Rule 3 (owner, 2026-09-15): a null target is the TRUTH — the
                кафедра has no розподіл ставок yet — and «—» says that, where a
                0 would read as a target this person already cleared. */}
            <TableCell numeric>
              {row.targetHundredths === null ? '—' : formatHours(row.targetHundredths)}
            </TableCell>
            <TableCell numeric>{formatHours(row.plannedHundredths)}</TableCell>
            <TableCell numeric>{formatHours(row.doneHundredths)}</TableCell>
            <TableCell numeric>
              {row.shortfallHundredths === null ? '—' : formatHours(row.shortfallHundredths)}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1.5">
                {row.isPartTime && <Badge tone="warn">Сумісник</Badge>}
                {/* Three states, not two. «Має план» said nothing about
                    whether it was ever HANDED IN, though наказ п.33 sets a
                    date for exactly that — a head could not tell a draft from
                    a submitted plan, and ННВ could not see what it may
                    reopen. */}
                {!row.hasPlan ? (
                  <Badge tone="warn">Немає плану</Badge>
                ) : row.lockedAt ? (
                  <Badge tone="ok">Збережено</Badge>
                ) : (
                  <Badge tone="muted">Чернетка</Badge>
                )}
              </div>
            </TableCell>
            {canUnlock && (
              <TableCell align="right">
                {row.planId && row.lockedAt && (
                  <UnlockPlanButton
                    planId={row.planId}
                    fullName={row.fullName}
                    departmentName={row.departmentName}
                  />
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
