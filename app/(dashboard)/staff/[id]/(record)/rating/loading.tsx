import { TableSkeleton } from '@/components/aurora/ui/table-skeleton';
import { RecordToolbar } from '@/components/staff/record-toolbar';
import { ToolbarGroupSkeleton } from '@/components/staff/profile/profile-skeleton';

/**
 * The Рейтинг tab: № · Показник · Джерело · Бали, with the year's total pinned
 * under the rows. `flex min-h-0 flex-1 flex-col`, as `page.tsx` has, so the card
 * takes the height left over rather than guessing at it.
 *
 * The controls go through the SAME portal the loaded tab uses, so the year
 * picker, the «незаповнені» switch and the export appear in the strip they will
 * occupy. They used to be two loose blocks on a line of their own below the
 * tabs — a row the page never actually has, which then disappeared.
 */
export default function StaffRatingLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordToolbar>
        <ToolbarGroupSkeleton widths={[104, 168, 150]} />
      </RecordToolbar>
      <TableSkeleton columns={[6, 60, 18, 10]} rows={9} footer />
    </div>
  );
}
