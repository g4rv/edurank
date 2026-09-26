import { Skeleton } from '@/components/ui/skeleton';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { ListTableSkeleton } from '@/components/ui/list-table-skeleton';

/**
 * «Рейтинг НПП» while it loads — the same header card and the same table box
 * the page draws, so nothing moves when the rows arrive.
 *
 * The title is a real string: this page has one heading whatever the query
 * string says, unlike `/staff`, which is «Персонал» or «Архів».
 */

/** Mirrors `rating-rollup-table.tsx` — the кафедра is the flexible column. */
const COLUMNS = ['w-10', 'w-72', 'flex-1', 'w-12', 'w-12', 'w-12', 'w-12', 'w-12', 'w-14'] as const;

const ROWS = [
  ['w-6', 'w-56', 'w-64', 'w-8', 'w-8', 'w-8', 'w-6', 'w-8', 'w-10'],
  ['w-6', 'w-64', 'w-56', 'w-8', 'w-6', 'w-8', 'w-8', 'w-6', 'w-10'],
  ['w-6', 'w-48', 'w-72', 'w-6', 'w-8', 'w-8', 'w-8', 'w-8', 'w-10'],
  ['w-6', 'w-60', 'w-60', 'w-8', 'w-8', 'w-6', 'w-8', 'w-8', 'w-10'],
  ['w-6', 'w-52', 'w-64', 'w-8', 'w-6', 'w-8', 'w-6', 'w-8', 'w-10'],
  ['w-6', 'w-64', 'w-48', 'w-6', 'w-8', 'w-8', 'w-8', 'w-6', 'w-10'],
  ['w-6', 'w-56', 'w-72', 'w-8', 'w-8', 'w-6', 'w-8', 'w-8', 'w-10'],
  ['w-6', 'w-48', 'w-56', 'w-8', 'w-6', 'w-8', 'w-8', 'w-8', 'w-10'],
  ['w-6', 'w-60', 'w-64', 'w-6', 'w-8', 'w-8', 'w-6', 'w-8', 'w-10'],
  ['w-6', 'w-56', 'w-60', 'w-8', 'w-8', 'w-8', 'w-8', 'w-6', 'w-10'],
] as const;

export default function RatingRollupLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Рейтинг НПП"
        subtitle={<Skeleton className="h-4 w-24" />}
        actions={
          <>
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-8 w-48 rounded-lg" />
          </>
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-72 rounded-lg" />
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-8 min-w-64 flex-1 rounded-lg" />
          </div>
        }
      />

      <ListTableSkeleton
        columns={COLUMNS}
        rows={ROWS}
        headWidths={['w-4', 'w-10', 'w-16', 'w-6', 'w-6', 'w-6', 'w-6', 'w-6', 'w-12']}
      />
    </div>
  );
}
