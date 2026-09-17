import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';

const CRUMBS = [{ label: 'Управління' }, { label: 'Плани кафедри' }];
const FIGURE_COLUMN = 'calc(6ch + 2rem)';
const PLANNED_COLUMN = 'calc(8ch + 2rem)';
const STATE_COLUMN = '13rem';

/**
 * The title is printed, not shimmered — it never depends on the query. The
 * subtitle (the template's academic year and the count) does, so that one
 * shimmers.
 *
 * **No «Кафедра» column and no кафедра picker here** — the same call
 * `achievements/students/loading.tsx` makes for its «Дії» column: a завідувач
 * with one кафедра is the commoner case, so the shell draws the shape most
 * visits land on rather than guessing which of the two a particular head gets.
 */
export default function DepartmentSciencePlansLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Плани кафедри</h1>
        <Skeleton className="mt-1.5 h-4 w-40" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-full sm:w-48" />
      </div>

      <div className="grid grid-cols-2 rounded-xl border bg-card sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      <Table
        fill
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
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
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
