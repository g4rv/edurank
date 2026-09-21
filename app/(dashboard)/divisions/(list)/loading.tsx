import { Skeleton } from '@/components/ui/skeleton';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { ListTableSkeleton } from '@/components/ui/list-table-skeleton';

/** «Відділи» while it loads — see `faculties/(list)/loading.tsx` for the shape
 *  and for why this sits in a route group. */

/** Mirrors `division-table.tsx` — the name is the flexible column. */
const COLUMNS = ['flex-1', 'w-40', 'w-64', 'w-20'] as const;

const ROWS = [
  ['w-80', 'w-6', 'w-32', 'w-8'],
  ['w-96', 'w-4', 'w-28', 'w-8'],
  ['w-64', 'w-6', 'w-36', 'w-8'],
  ['w-72', 'w-6', 'w-24', 'w-8'],
  ['w-88', 'w-4', 'w-32', 'w-8'],
] as const;

export default function DivisionsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Відділи"
        subtitle={<Skeleton className="h-4 w-40" />}
        actions={<Skeleton className="h-8 w-40 rounded-lg" />}
      />

      <ListTableSkeleton
        columns={COLUMNS}
        rows={ROWS}
        headWidths={['w-16', 'w-28', 'w-20', 'w-8']}
      />
    </div>
  );
}
