import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';

const CRUMBS = [{ label: 'Управління' }, { label: 'Плани кафедри' }];
const FIGURE_COLUMN = 'calc(6ch + 2rem)';
const PLANNED_COLUMN = 'calc(8ch + 2rem)';
const STATE_COLUMN = '13rem';

/**
 * The title is printed, not shimmered — it never depends on the query. The
 * subtitle (the template's academic year) does, so that one shimmers.
 *
 * **No «Кафедра» column here** — the same call `achievements/students/loading.tsx`
 * makes for its «Дії» column: a завідувач with one кафедра is the commoner
 * case, so the shell draws the shape most visits land on rather than guessing
 * which of the two a particular head gets.
 */
export default function DepartmentSciencePlansLoading() {
  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Плани кафедри</h1>
        <Skeleton className="mt-1.5 h-4 w-40" />
      </div>

      <Table
        containerClassName="min-h-0"
        columns={[null, FIGURE_COLUMN, FIGURE_COLUMN, PLANNED_COLUMN, FIGURE_COLUMN, STATE_COLUMN]}
        head={
          <TableRow>
            <TableHead>ПІБ</TableHead>
            <TableHead numeric>Ставка</TableHead>
            <TableHead numeric>Ціль</TableHead>
            <TableHead numeric>Заплановано</TableHead>
            <TableHead numeric>Бракує</TableHead>
            <TableHead>Стан</TableHead>
          </TableRow>
        }
      >
        <TableBody className="[&_td]:h-12 [&_td]:align-middle">
          {[0, 1, 2].map((row) => (
            <TableRow key={row}>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell numeric>
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
              <TableCell numeric>
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
              <TableCell numeric>
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
              <TableCell numeric>
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24 rounded-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
