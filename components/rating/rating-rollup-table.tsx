import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/aurora/ui/table';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { cn } from '@/lib/utils';
import type { RatingRow } from '@/lib/queries/list-ratings';

/**
 * One CSS width per column, in the order they are rendered.
 *
 * **`null` is the кафедра**, the longest text on the row — the same call
 * `/staff` and the claims table both landed on. The ПІБ is a declared width so
 * it stays on one line and every name starts at the same x.
 *
 * Nine columns is the most in the app, so the budget is tight: 4 + 19 + 25 + 7
 * = 55rem declared, plus a 12rem floor for the кафедра = 67rem (1072px), inside
 * the ~1109px a 1366px window leaves beside the sidebar. §12 of
 * `docs/aurora.md`: the declared widths have to ADD UP, or the card scrolls
 * sideways on every screen with its last column off the edge.
 *
 * Even numbers throughout — §4.
 */
const RANK_COLUMN = '4rem';
const NAME_COLUMN = '19rem';
/** Five of these. A section score is at most four digits; «Р1» sets nothing. */
const SECTION_COLUMN = '5rem';
/** «РАЗОМ» is what sets this, not the figure. */
const TOTAL_COLUMN = '7rem';
const DEPARTMENT_FLOOR = '12rem';

const SECTIONS = [1, 2, 3, 4, 5] as const;

/**
 * «Рейтинг НПП» — every НПП in the university, ranked.
 *
 * **`fill`, not the table's default cap.** This is the page §4 of
 * `docs/aurora.md` measured at 16 730px tall: ~330 rows put straight onto the
 * page, so the browser scrolled past the header, the filters and the column
 * names to reach row 300. The rows scroll INSIDE the card now, and the headings
 * stay on screen — which is what that section's «the fill pattern on /staff and
 * /admin/students» is pointing at.
 */
export function RatingRollupTable({
  rows,
  head,
}: {
  rows: RatingRow[];
  /** Built by the page, which owns the sort links — see `SortHead` */
  head: React.ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState>Нікого не знайдено</EmptyState>;
  }

  const columns = [
    RANK_COLUMN,
    NAME_COLUMN,
    null,
    ...SECTIONS.map(() => SECTION_COLUMN),
    TOTAL_COLUMN,
  ];
  const minWidth = `calc(${RANK_COLUMN} + ${NAME_COLUMN} + ${DEPARTMENT_FLOOR} + (5 * ${SECTION_COLUMN}) + ${TOTAL_COLUMN})`;

  return (
    <Table columns={columns} minWidth={minWidth} head={head} fill>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.id} className="[&>td]:align-middle" hoverable>
            {/* §4 names «row numbers» as meta, and this is one — the rank comes
                from the sort, so it changes meaning the moment somebody orders
                by ПІБ. The figures it indexes are what the page is for. */}
            <TableCell numeric align="center" muted>
              {index + 1}
            </TableCell>

            <RowLinkCell href={`/staff/${row.id}/rating`} className="py-2.5">
              {/* One line: a ПІБ broken in two is read twice, and at 19rem every
                  name in the register fits. `title` carries the whole of it for
                  the rare one that does not. */}
              <span className="block truncate" title={row.name}>
                {row.name}
              </span>
            </RowLinkCell>

            <TableCell>
              {row.department ?? '—'}
              {/* Another кафедра also pays them a ставка (2026-08-24). Shown on
                  every row, filtered or not, so the кафедра column never tells
                  only half the story. Amber because that ставка comes out of two
                  pools and the row does not count toward this кафедра's Кнпп —
                  §3 of `docs/aurora.md` allows a hue on a badge that reports
                  one condition. */}
              {row.partTimeDepartments.length > 0 && (
                <span
                  className="ml-2 inline-flex items-center rounded-full bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning"
                  title={`Також працює за сумісництвом: ${row.partTimeDepartments.join(', ')}`}
                >
                  Сумісник
                </span>
              )}
            </TableCell>

            {row.sections.map((score, i) => (
              <TableCell
                key={i}
                numeric
                align="center"
                // A zero is `--muted-foreground`, not `/50`. §5 keeps the row —
                // «a zero that is a fact… that gap is the point» — and the
                // point is only made if the figure can still be READ. At half
                // opacity it measured around 3:1, below the floor for text, on
                // the one column somebody scans down.
                className={cn('px-2', score === 0 && 'text-muted-foreground')}
              >
                {score}
              </TableCell>
            ))}

            {/* The number the page exists to produce. */}
            <TableCell numeric align="center" className="font-semibold">
              {row.total}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
