import { Skeleton } from '@/components/ui/skeleton';

/**
 * A list table's own shape while it loads.
 *
 * It has to match the real table column for column, or the page re-laysout the
 * moment the rows arrive — so a caller passes the SAME widths its `Table`
 * declares, written as flex bases because there is no `<table>` here and
 * nothing to hang a `colgroup` on. `flex-1` stands in for the `null` column.
 *
 * Shared rather than written out per screen: `/faculties`, `/departments` and
 * `/divisions` draw the identical shell, and §11 of `docs/aurora.md` is about
 * exactly the three copies that would otherwise be here.
 *
 * The card's own classes are `Table`'s, copied deliberately — `max-h-fit
 * min-h-0 flex-1` is what `fill` resolves to, so the skeleton and the table
 * occupy the same box.
 */
export function ListTableSkeleton({
  columns,
  rows,
  headWidths,
}: {
  /** One flex basis per column, in order — `flex-1` for the flexible one. */
  columns: readonly string[];
  /**
   * One width class per cell, per row. Varied on purpose: a column of identical
   * bars reads as a rendering artefact rather than as text.
   *
   * The literal `'group'` draws a section heading instead — the tinted, full
   * width band `Table`'s `variant="group"` row paints, so a grouped list does
   * not arrive as a flat one and then re-lay itself out.
   */
  rows: readonly (readonly string[] | 'group')[];
  /** One width class per column heading — they are short words, not values. */
  headWidths: readonly string[];
}) {
  return (
    <div className="flex max-h-fit min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex shrink-0 items-center gap-4 border-b px-4 py-3">
        {columns.map((basis, i) => (
          <div key={i} className={basis}>
            <Skeleton className={`h-4 ${headWidths[i]}`} />
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-auto divide-y overflow-hidden">
        {rows.map((cells, r) =>
          cells === 'group' ? (
            <div key={r} className="bg-table-group px-4 py-2.5">
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <div key={r} className="flex items-center gap-4 px-4 py-3">
              {columns.map((basis, i) => (
                <div key={i} className={basis}>
                  <Skeleton className={`h-4 ${cells[i]}`} />
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
