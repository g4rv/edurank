import { Badge } from '@/components/aurora/ui/badge';
import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { decimalText } from '@/lib/decimal-input';
import type { DepartmentReportRow } from '@/lib/queries/list-department-reports';

/**
 * Widths add up (§12 of docs/aurora.md): 4 + 16 floor + 18 + 10 = 48rem.
 *
 * **The факультет is a column here, not a heading.** §12 turns a repeated
 * column into group headings, and says what it costs: the global order. This
 * screen IS the global order — a ranking of кафедри across факультети — so the
 * trade goes the other way.
 */
const COLUMNS = ['4rem', null, '18rem', '10rem'] as const;
const MIN_WIDTH = 'calc(4rem + 16rem + 18rem + 10rem)';

export function DepartmentReportList({ rows }: { rows: DepartmentReportRow[] }) {
  if (rows.length === 0) return <EmptyState>Кафедр не знайдено</EmptyState>;

  return (
    <Table
      columns={COLUMNS}
      minWidth={MIN_WIDTH}
      fill
      head={
        <TableRow>
          <TableHead align="center">№</TableHead>
          <TableHead>Кафедра</TableHead>
          <TableHead>Факультет</TableHead>
          <TableHead align="right">Всього</TableHead>
        </TableRow>
      }
    >
      <TableBody>
        {rows.map((row, i) => {
          // Only a кафедра that has filled its report takes a place. They sort
          // first (`listDepartmentReports`), so the place is the row's position.
          const filled = row.totalScore !== null;
          return (
            <TableRow key={row.id} className="[&>td]:align-middle" hoverable>
              <TableCell align="center" numeric muted>
                {filled ? i + 1 : '—'}
              </TableCell>
              <RowLinkCell href={`/department-rating/${row.id}`} className="py-2.5">
                {row.name}
              </RowLinkCell>
              <TableCell>{row.faculty}</TableCell>
              <TableCell align="right" numeric>
                {filled ? decimalText(row.totalScore) : <Badge tone="warn">Не заповнено</Badge>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
