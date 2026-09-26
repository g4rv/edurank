import { Skeleton } from '@/components/ui/skeleton';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { ListTableSkeleton } from '@/components/ui/list-table-skeleton';

/**
 * «Журнал аудиту» while it loads — the same header card and table box the page
 * draws, so nothing moves when the rows arrive.
 */

/** Mirrors `audit-log-table.tsx` — «Зміни» is the flexible column. */
const COLUMNS = ['w-40', 'w-32', 'w-52', 'flex-1', 'w-48'] as const;

const ROWS = [
  ['w-32', 'w-20', 'w-40', 'w-64', 'w-40'],
  ['w-32', 'w-24', 'w-32', 'w-56', 'w-36'],
  ['w-32', 'w-20', 'w-44', 'w-72', 'w-44'],
  ['w-32', 'w-24', 'w-36', 'w-48', 'w-40'],
  ['w-32', 'w-20', 'w-40', 'w-64', 'w-32'],
  ['w-32', 'w-24', 'w-32', 'w-56', 'w-44'],
  ['w-32', 'w-20', 'w-48', 'w-72', 'w-36'],
  ['w-32', 'w-24', 'w-36', 'w-52', 'w-40'],
  ['w-32', 'w-20', 'w-40', 'w-64', 'w-44'],
  ['w-32', 'w-24', 'w-44', 'w-48', 'w-36'],
] as const;

export default function AuditLogLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Журнал аудиту"
        subtitle={<Skeleton className="h-4 w-28" />}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-72 rounded-lg" />
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-8 w-60 rounded-lg" />
            <Skeleton className="h-8 w-56 rounded-lg" />
          </div>
        }
      />

      <ListTableSkeleton
        columns={COLUMNS}
        rows={ROWS}
        headWidths={['w-10', 'w-8', 'w-14', 'w-12', 'w-24']}
      />
    </div>
  );
}
