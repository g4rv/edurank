import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/aurora/ui/table';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { DeleteDivisionButton } from '@/components/division/delete-button';
import { countUk } from '@/lib/plural';
import type { DivisionListItem } from '@/lib/queries/list-divisions';

/**
 * One CSS width per column, in the order they are rendered.
 *
 * Even numbers throughout — §4 of `docs/aurora.md`.
 */
const STAFF_COLUMN = '10rem'; // «СПІВРОБІТНИКИ» is what sets this, not the figure
const GRANTS_COLUMN = '16rem';
const ACTIONS_COLUMN = '4rem';

const NAME_FLOOR = '20rem';

/**
 * «Відділи» — a handful of rows, and the only list in the app whose subject is
 * the permission model itself.
 *
 * **«Дозволи» is the column this screen was missing.** A відділ decides what
 * its editors may edit and which entities they may create, and the list showed
 * neither — so «which відділи can actually do anything» took a click into each
 * record in turn. Two figures answer it at a glance; the record behind the row
 * is still where you read WHICH ones.
 */
export function DivisionTable({
  divisions,
  head,
  showActions,
  fill,
}: {
  divisions: DivisionListItem[];
  /** Built by the page, which owns the sort links — see `SortHead` */
  head: React.ReactNode;
  /**
   * The «Дії» column. ADMIN only, like creating a відділ — see the guard on
   * the page. There is no edit button in it: the row opens the record, and the
   * record's own header is where «Редагувати» lives — see `faculty-table.tsx`.
   */
  showActions: boolean;
  fill?: boolean;
}) {
  if (divisions.length === 0) {
    return <EmptyState>Відділів не знайдено</EmptyState>;
  }

  const columns = showActions
    ? [null, STAFF_COLUMN, GRANTS_COLUMN, ACTIONS_COLUMN]
    : [null, STAFF_COLUMN, GRANTS_COLUMN];

  const minWidth = `calc(${NAME_FLOOR} + ${STAFF_COLUMN} + ${GRANTS_COLUMN}${
    showActions ? ` + ${ACTIONS_COLUMN}` : ''
  })`;

  return (
    <Table columns={columns} minWidth={minWidth} head={head} fill={fill}>
      <TableBody>
        {divisions.map((division) => {
          const fields = division._count.fieldPermissions;
          const entities = division._count.entityPermissions;

          return (
            <TableRow key={division.id} className="[&>td]:align-middle" hoverable>
              <RowLinkCell href={`/divisions/${division.id}`} className="py-2.5">
                {division.name}
              </RowLinkCell>

              <TableCell align="center" numeric>
                {division._count.staff}
              </TableCell>

              <TableCell>
                {fields === 0 && entities === 0 ? (
                  // Not «0 полів · 0 операцій». A відділ that grants nothing is
                  // a real and common state — most of them exist to hold people
                  // — and two zeros read as a record somebody failed to finish.
                  <span className="text-muted-foreground">Без дозволів</span>
                ) : (
                  <span className="tabular-nums">
                    {countUk(fields, 'поле', 'поля', 'полів')} ·{' '}
                    {countUk(entities, 'операція', 'операції', 'операцій')}
                  </span>
                )}
              </TableCell>

              {showActions && (
                // Centred — see `faculty-table.tsx`.
                <TableCell align="center">
                  <DeleteDivisionButton divisionId={division.id} divisionName={division.name} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
