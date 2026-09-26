import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/aurora/ui/table';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { CellLink } from '@/components/ui/cell-link';
import { DeleteFacultyButton } from '@/components/faculty/delete-button';
import type { FacultyListItem } from '@/lib/queries/list-faculties';

/**
 * One CSS width per column, in the order they are rendered.
 *
 * **`null` is the name**, which absorbs whatever the window has left — unlike
 * `/staff`, where the кафедра is the longest text on the row, a факультет's own
 * name is («Факультет фізики, математики та інформатики» is 46 characters) and
 * every other column here is a person or a figure of known size.
 *
 * Even numbers throughout — §4 of `docs/aurora.md`.
 */
const DEAN_COLUMN = '18rem'; // 288px — «Гончаренко Олексій Миколайович», unwrapped
const COUNT_COLUMN = '9rem'; // «КАФЕДРИ» is what sets this, not the figure
const ACTIONS_COLUMN = '4rem';

/** The floor the flexible name column may shrink to before the card scrolls. */
const NAME_FLOOR = '20rem';

/**
 * «Факультети» — eight rows, and every column on them sorts.
 *
 * The list is short enough that it never pages and never needs a filter; what a
 * reader actually does here is re-order it — by декан to find somebody, by
 * кафедри to see which факультет is the large one. So sorting is the whole of
 * the narrowing this screen offers, and `head` is built by the page, which owns
 * the URL the chevrons point at.
 */
export function FacultyTable({
  faculties,
  head,
  canDelete,
  fill,
}: {
  faculties: FacultyListItem[];
  /** Built by the page, which owns the sort links — see `SortHead` */
  head: React.ReactNode;
  /**
   * The «Дії» column, and the only thing in it.
   *
   * **There is no edit button in the list** (owner, 2026-09-21), the same shape
   * `/staff` already has: the row opens the record, and the record's own header
   * is where «Редагувати» lives. A pencil in the list is a second route to one
   * form, and it competes with the row itself for the click.
   */
  canDelete: boolean;
  fill?: boolean;
}) {
  if (faculties.length === 0) {
    return <EmptyState>Факультетів не знайдено</EmptyState>;
  }

  const columns = canDelete
    ? [null, DEAN_COLUMN, COUNT_COLUMN, ACTIONS_COLUMN]
    : [null, DEAN_COLUMN, COUNT_COLUMN];

  const minWidth = canDelete
    ? `calc(${NAME_FLOOR} + ${DEAN_COLUMN} + ${COUNT_COLUMN} + ${ACTIONS_COLUMN})`
    : `calc(${NAME_FLOOR} + ${DEAN_COLUMN} + ${COUNT_COLUMN})`;

  return (
    <Table columns={columns} minWidth={minWidth} head={head} fill={fill}>
      <TableBody>
        {faculties.map((faculty) => (
          // Every cell on the row's own centre line: the name is the only cell
          // that ever wraps, and a figure top-aligned against two lines of it
          // sits beside nothing in particular.
          <TableRow key={faculty.id} className="[&>td]:align-middle" hoverable>
            <RowLinkCell href={`/faculties/${faculty.id}`} className="py-2.5">
              {faculty.name}
            </RowLinkCell>

            <TableCell>
              {/* The декан opens their own record. Ink, like every other value —
                  §4 of `docs/aurora.md` keeps `--muted-foreground` for meta that
                  is glanced at, and the декан is the reason somebody reads this
                  row. */}
              {faculty.dean ? (
                <CellLink href={`/staff/${faculty.dean.id}`}>
                  {`${faculty.dean.lastName} ${faculty.dean.firstName} ${faculty.dean.patronymic}`}
                </CellLink>
              ) : (
                // §5: a blank shows «—», because a reader does expect a value
                // here — every факультет has a декан, or is missing one.
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>

            <TableCell align="center" numeric>
              {faculty._count.departments}
            </TableCell>

            {canDelete && (
              // **Centred, not right-aligned.** The app's other «Дії» columns
              // right-align because they hold three or four wide buttons that
              // fill the cell. One 28px icon in a 64px column does not: against
              // the right edge it left 36px of air on its left and 16px on its
              // right, which reads as a misplaced icon rather than as a column
              // (owner, 2026-09-21).
              <TableCell align="center">
                <DeleteFacultyButton facultyId={faculty.id} facultyName={faculty.name} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
