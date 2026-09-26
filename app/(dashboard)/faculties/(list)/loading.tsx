import { Skeleton } from '@/components/ui/skeleton';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { ListTableSkeleton } from '@/components/ui/list-table-skeleton';

/**
 * «Факультети» while it loads — the same header card and the same table box the
 * page draws, with skeletons in them, so nothing moves when the rows arrive.
 *
 * **In a `(list)` route group, and that is load-bearing.** A `loading.tsx`
 * covers its own segment AND every route beneath it, so while this sat at
 * `faculties/` it was also the boundary for `faculties/[id]` and
 * `faculties/new` — and a hard reload of one факультет streamed this list
 * skeleton alongside the record's own. Two skeletons for two different pages,
 * on screen at once. A route group changes no URL: `/faculties` is still
 * `/faculties`.
 *
 * The title is a real string here, unlike `/staff`: this page has one heading
 * whatever the query string says.
 */

/** Mirrors `faculty-table.tsx` — the name is the flexible column. */
const COLUMNS = ['flex-1', 'w-72', 'w-36', 'w-20'] as const;

const ROWS = [
  ['w-72', 'w-56', 'w-6', 'w-8'],
  ['w-96', 'w-48', 'w-6', 'w-8'],
  ['w-64', 'w-60', 'w-4', 'w-8'],
  ['w-80', 'w-52', 'w-6', 'w-8'],
  ['w-72', 'w-56', 'w-6', 'w-8'],
  ['w-88', 'w-44', 'w-4', 'w-8'],
] as const;

export default function FacultiesLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Факультети"
        subtitle={<Skeleton className="h-4 w-40" />}
        actions={<Skeleton className="h-8 w-40 rounded-lg" />}
      />

      <ListTableSkeleton
        columns={COLUMNS}
        rows={ROWS}
        headWidths={['w-16', 'w-14', 'w-20', 'w-8']}
      />
    </div>
  );
}
