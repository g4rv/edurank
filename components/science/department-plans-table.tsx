import Link from 'next/link';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { formatStake } from '@/lib/stake/units';
import { formatHours } from '@/lib/science/hours';
import { planListHref, type PlanListParams } from '@/lib/science/list-params';
import { nextDir, type PlanSortField } from '@/lib/science/plan-rows';
import type { SciencePlanRowSummary } from '@/lib/queries/list-science-plans';
import { cn } from '@/lib/utils';

const FIGURE_COLUMN = 'calc(6ch + 2rem)';
const PLANNED_COLUMN = 'calc(8ch + 2rem)';
const DEPARTMENT_COLUMN = '14rem';
const STATE_COLUMN = '13rem';

/**
 * A heading that sorts.
 *
 * **Local and unexported** — §11 of `docs/aurora.md`: one caller means it is
 * not shared yet, and the app's other sortable heading (`components/ui/sort-th`)
 * draws a shadcn `<th>` of its own, which would put a second header look inside
 * an Аврора table. The second screen that wants this is what moves it into
 * `components/aurora/ui/table.tsx`, with this one repointed in the same commit.
 */
function SortHead({
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
  const active = params.sort === column;
  const dir = nextDir(params.sort, params.dir, column);
  const href = planListHref(basePath, params, { sort: column, dir });

  return (
    <TableHead numeric={numeric} className={className}>
      <Link
        href={href}
        aria-sort={active ? (params.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-brand',
          numeric && 'flex-row-reverse'
        )}
      >
        {label}
        {active ? (
          params.dir === 'asc' ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          // Present but faint on every sortable column: a chevron that appears
          // only on hover tells nobody with a touch screen that the column
          // sorts at all.
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </Link>
    </TableHead>
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
}: {
  rows: readonly SciencePlanRowSummary[];
  showDepartment: boolean;
  params: PlanListParams;
  basePath: string;
}) {
  const columns = showDepartment
    ? [
        null,
        DEPARTMENT_COLUMN,
        FIGURE_COLUMN,
        FIGURE_COLUMN,
        PLANNED_COLUMN,
        FIGURE_COLUMN,
        STATE_COLUMN,
      ]
    : [null, FIGURE_COLUMN, FIGURE_COLUMN, PLANNED_COLUMN, FIGURE_COLUMN, STATE_COLUMN];

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
          <SortHead label="ПІБ" column="name" params={params} basePath={basePath} />
          {showDepartment && (
            <SortHead label="Кафедра" column="department" params={params} basePath={basePath} />
          )}
          <SortHead label="Ставка" column="rate" params={params} basePath={basePath} numeric />
          <SortHead label="Ціль" column="target" params={params} basePath={basePath} numeric />
          <SortHead
            label="Заплановано"
            column="planned"
            params={params}
            basePath={basePath}
            numeric
          />
          <SortHead label="Бракує" column="shortfall" params={params} basePath={basePath} numeric />
          <TableHead>Стан</TableHead>
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
            <TableCell numeric>
              {row.shortfallHundredths === null ? '—' : formatHours(row.shortfallHundredths)}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1.5">
                {row.isPartTime && <Badge tone="warn">Сумісник</Badge>}
                {!row.hasPlan && <Badge tone="warn">Немає плану</Badge>}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
