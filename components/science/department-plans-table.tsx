import { Badge } from '@/components/aurora/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { formatStake } from '@/lib/stake/units';
import { formatHours } from '@/components/science/plan-total';
import type { SciencePlanRowSummary } from '@/lib/queries/list-science-plans';

/**
 * A person is short of their target only when they HAVE one — a null target
 * (no розподіл yet, D8) is not «short», it is «nothing to compare against».
 * `shortfallHundredths` is already `null` for exactly that case (`planTarget`
 * in `lib/science/target.ts`), so this is the one field the sort needs.
 */
// Exported: the university-wide view's summary strip (Task 11) counts the
// same «short of target» rows this table sorts to the top, and a second copy
// of this predicate is exactly the drift §11 of docs/aurora.md warns about.
export function isShort(row: SciencePlanRowSummary): boolean {
  return row.shortfallHundredths !== null && row.shortfallHundredths > 0;
}

/**
 * Short-of-target first, then alphabetically — the page exists to find who
 * has not planned, not to read the roster in roster order. A `Staff` name has
 * no locale-independent order (ї, і, є sort differently under the default
 * comparator), so `localeCompare(…, 'uk')` is what every other name sort in
 * this app uses.
 */
function sortRows(rows: readonly SciencePlanRowSummary[]): SciencePlanRowSummary[] {
  return [...rows].sort((a, b) => {
    const aShort = isShort(a);
    const bShort = isShort(b);
    if (aShort !== bShort) return aShort ? -1 : 1;
    return a.fullName.localeCompare(b.fullName, 'uk');
  });
}

const FIGURE_COLUMN = 'calc(6ch + 2rem)';
const PLANNED_COLUMN = 'calc(8ch + 2rem)';
const DEPARTMENT_COLUMN = '14rem';
const STATE_COLUMN = '13rem';

/**
 * A завідувача's or декан's read of who on their кафедра(и) has planned their
 * наукова робота. No edit path lives here — see the owner's note on Task 10:
 * this screen only ever answers «may I look», the same split `scopeOf` /
 * `headOf` draw everywhere else in the app.
 */
export function DepartmentPlansTable({
  rows,
  showDepartment,
}: {
  rows: SciencePlanRowSummary[];
  showDepartment: boolean;
}) {
  const sorted = sortRows(rows);
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
    <Table
      containerClassName="min-h-0"
      columns={columns}
      head={
        <TableRow>
          <TableHead>ПІБ</TableHead>
          {showDepartment && <TableHead>Кафедра</TableHead>}
          <TableHead numeric>Ставка</TableHead>
          <TableHead numeric>Ціль</TableHead>
          <TableHead numeric>Заплановано</TableHead>
          <TableHead numeric>Бракує</TableHead>
          <TableHead>Стан</TableHead>
        </TableRow>
      }
    >
      <TableBody className="[&_td]:align-middle">
        {sorted.map((row) => (
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
