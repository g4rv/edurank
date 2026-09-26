import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/aurora/ui/table';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { CellLink } from '@/components/ui/cell-link';
import { DeleteDepartmentButton } from '@/components/department/delete-button';
import { UK } from '@/lib/plural';
import type { DepartmentGroup } from '@/lib/queries/list-departments';

/**
 * One CSS width per column, in the order they are rendered.
 *
 * **`null` is the name**, and grouping is what finally gave it room. The
 * факультет used to be a 16rem column repeating twelve names down fifty-four
 * rows, wrapping to three lines and leaving «Кафедра педагогіки, теорії і
 * методики початкової освіти» to wrap as well. As a heading it costs one row
 * per group instead of 54 cells, and the name gets the width back.
 *
 * Even numbers throughout — §4 of `docs/aurora.md`.
 */
const HEAD_COLUMN = '22rem'; // 352px — «Молоткіна Валентина Констянтинівна» plus its arrow, with air
const COUNT_COLUMN = '6rem';
const ACTIONS_COLUMN = '4rem';

/**
 * The floor the flexible name column may shrink to before the card scrolls.
 *
 * The declared widths have to ADD UP to less than a laptop's content area —
 * `minWidth` stops this column collapsing, it does not stop the card scrolling
 * sideways. 16 + 22 + 6 + 4 = 48rem (768px), comfortably inside the ~1090px a
 * 1366px window leaves beside the sidebar and inside a 1280px laptop.
 */
const NAME_FLOOR = '16rem';

/**
 * «Кафедри» — fifty-four rows under twelve факультет headings.
 *
 * **The heading is the факультет, and that fixes something a column could not**
 * (owner, 2026-09-21). Two кафедри can carry the SAME name on two different
 * факультети — «Кафедра екології, географії і методики навчання» exists twice,
 * «Кафедра економіки» twice — and in a flat list they read as duplicate records
 * somebody failed to clean up. The only thing telling them apart was a column
 * three across. Under a heading they stop being duplicates and start being two
 * кафедри, which is what they are.
 *
 * **Sorting is INSIDE a group.** «Назва», «Завідувач» and «НПП» reorder the
 * кафедри under each факультет; the факультети themselves stay А→Я. What that
 * costs is ranking all fifty-four by headcount at once, and `/stakes` already
 * lists every кафедра with its numbers — which is the screen a проректор asking
 * that question is on anyway.
 *
 * One `<tbody>` PER GROUP, not one around all of them. That is what makes the
 * headings stack: a sticky cell cannot leave its own sectioning box, so one
 * факультет's heading is carried away by the end of its rows just as the next
 * one arrives at the top of the scroll box. Several `<tbody>` elements in one
 * table is valid HTML and is exactly what they are for — see `rating-table`,
 * which does the same with Розділ 1–5.
 */
export function DepartmentTable({
  groups,
  head,
  canDelete,
  fill,
}: {
  groups: DepartmentGroup[];
  /** Built by the page, which owns the sort links — see `SortHead` */
  head: React.ReactNode;
  /**
   * The «Дії» column, and the only thing in it.
   *
   * **There is no edit button in the list** (owner, 2026-09-21), the same shape
   * `/staff` already has: the row opens the record, and the record's own header
   * is where «Редагувати» lives.
   */
  canDelete: boolean;
  fill?: boolean;
}) {
  if (groups.length === 0) {
    return <EmptyState>Кафедр не знайдено</EmptyState>;
  }

  const columns = canDelete
    ? [null, HEAD_COLUMN, COUNT_COLUMN, ACTIONS_COLUMN]
    : [null, HEAD_COLUMN, COUNT_COLUMN];

  const minWidth = `calc(${NAME_FLOOR} + ${HEAD_COLUMN} + ${COUNT_COLUMN}${
    canDelete ? ` + ${ACTIONS_COLUMN}` : ''
  })`;

  return (
    <Table columns={columns} minWidth={minWidth} head={head} fill={fill}>
      {groups.map((group) => (
        <TableBody key={group.id}>
          <TableRow variant="group">
            {/* The факультет's own record is one click from here, which is half
                of what the owner asked the heading for. `CellLink` draws it the
                way every other cross-reference in a row is drawn. */}
            <TableCell colSpan={2}>
              <CellLink href={`/faculties/${group.id}`}>{group.name}</CellLink>
              {/* How many кафедри the heading covers. Muted and in the same
                  cell, because it is a fact ABOUT the heading rather than a
                  column of its own — and `font-semibold` on the group row would
                  otherwise make a count look like a second title. */}
              <span className="ml-2 font-normal text-muted-foreground">
                {UK.department(group.count)}
              </span>
            </TableCell>

            {/* In the НПП column, not in the heading text: a total belongs over
                the figures it totals, where the eye can run down the column and
                find it. */}
            <TableCell align="center" numeric>
              {group.staffTotal}
            </TableCell>

            {canDelete && <TableCell />}
          </TableRow>

          {group.departments.map((dept) => (
            // Every cell on the row's own centre line — the name is the only
            // one that can wrap now, and a figure top-aligned against two lines
            // of it sits beside nothing in particular.
            <TableRow key={dept.id} className="[&>td]:align-middle" hoverable>
              <RowLinkCell href={`/departments/${dept.id}`} className="py-2.5">
                {dept.name}
              </RowLinkCell>

              <TableCell>
                {dept.head ? (
                  <CellLink href={`/staff/${dept.head.id}`}>
                    {`${dept.head.lastName} ${dept.head.firstName} ${dept.head.patronymic}`}
                  </CellLink>
                ) : (
                  // §5: a blank shows «—». A кафедра has a завідувач, or is
                  // missing one, and both are worth knowing.
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              <TableCell align="center" numeric>
                {dept._count.primaryStaff}
              </TableCell>

              {canDelete && (
                // Centred — see `faculty-table.tsx`.
                <TableCell align="center">
                  <DeleteDepartmentButton departmentId={dept.id} departmentName={dept.name} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  );
}
