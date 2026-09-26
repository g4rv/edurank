import { Skeleton } from '@/components/ui/skeleton';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { ListTableSkeleton } from '@/components/ui/list-table-skeleton';

/** «Кафедри» while it loads — see `faculties/(list)/loading.tsx` for the shape
 *  and for why this sits in a route group. */

/** Mirrors `department-table.tsx` — the name is the flexible column. */
const COLUMNS = ['flex-1', 'w-88', 'w-24', 'w-16'] as const;

/**
 * Grouped, like the table it stands in for: a факультет heading and the кафедри
 * under it. Drawing a flat list here would re-lay the page out the moment the
 * real one arrived, which is the one thing a skeleton exists to prevent.
 */
const ROWS = [
  'group',
  ['w-96', 'w-56', 'w-6', 'w-8'],
  ['w-72', 'w-48', 'w-6', 'w-8'],
  ['w-80', 'w-60', 'w-4', 'w-8'],
  'group',
  ['w-96', 'w-52', 'w-6', 'w-8'],
  ['w-64', 'w-56', 'w-6', 'w-8'],
  ['w-88', 'w-44', 'w-4', 'w-8'],
  'group',
  ['w-72', 'w-60', 'w-6', 'w-8'],
  ['w-96', 'w-48', 'w-6', 'w-8'],
] as const;

export default function DepartmentsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Кафедри"
        subtitle={<Skeleton className="h-4 w-40" />}
        actions={<Skeleton className="h-8 w-40 rounded-lg" />}
      />

      <ListTableSkeleton
        columns={COLUMNS}
        rows={ROWS}
        headWidths={['w-16', 'w-24', 'w-10', 'w-8']}
      />
    </div>
  );
}
