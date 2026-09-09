import { TableSkeleton } from '@/components/aurora/ui/table-skeleton';
import { RecordToolbar } from '@/components/staff/record-toolbar';
import { ToolbarGroupSkeleton } from '@/components/staff/profile/profile-skeleton';

/**
 * The Характеристика tab.
 *
 * There was no boundary here at all, so this tab fell back to the one beside it
 * and drew the Профіль's two columns of cards over what is a single wide table
 * — twenty licence positions, each with a column of evidence beside it.
 *
 * `prose` rows, because both middle columns carry sentences: the position's own
 * wording, and the publications that satisfy it. A single-line row would settle
 * into the real table's height with a visible jump.
 */
export default function StaffKharakterystykaLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordToolbar>
        <ToolbarGroupSkeleton widths={[210, 150]} />
      </RecordToolbar>
      <TableSkeleton columns={[5, 46, 40, 9]} rows={6} rowHeight="prose" />
    </div>
  );
}
