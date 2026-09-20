import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';

const CRUMBS = [{ label: 'Управління' }, { label: 'Наукова робота' }];
const FIGURE_COLUMN = 'calc(6ch + 2rem)';
const PLANNED_COLUMN = 'calc(8ch + 2rem)';
const DEPARTMENT_COLUMN = '14rem';
const STATE_COLUMN = '13rem';

/**
 * Same shape as `/my-department/science-plans/loading.tsx`, plus the факультет
 * picker that screen never has — and, like it, the page's own fixed chrome
 * drawn to the pixel: the flex column, the filter row, the strip and the
 * table's `fill`, so nothing moves when the rows arrive.
 */
export default function AllSciencePlansLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-full sm:w-72" />
        <Skeleton className="h-9 w-full sm:w-48" />
      </div>

      <div className="grid grid-cols-2 rounded-xl border bg-card sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      <Table
        fill
        columns={[
          null,
          DEPARTMENT_COLUMN,
          FIGURE_COLUMN,
          FIGURE_COLUMN,
          PLANNED_COLUMN,
          FIGURE_COLUMN,
          FIGURE_COLUMN,
          STATE_COLUMN,
        ]}
        head={
          <TableRow>
            <TableHead>ПІБ</TableHead>
            <TableHead>Кафедра</TableHead>
            <TableHead numeric>Ставка</TableHead>
            <TableHead numeric>Ціль</TableHead>
            <TableHead numeric>Заплановано</TableHead>
            <TableHead numeric>Виконано</TableHead>
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
              <TableCell>
                <Skeleton className="h-4 w-32" />
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
