import { RecordTabRowSkeleton } from '@/components/staff/profile/record-tab-row';
import { RatingTable } from '@/components/rating/rating-table';

/**
 * The Рейтинг tab.
 *
 * Everything static is printed: the tab bar's three words, the column headings,
 * «Загальна сума балів». Only the year, the count, the rows and the total are
 * unknown, and only those shimmer.
 */
export default function StaffRatingLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRowSkeleton toolbar="rating" />
      <RatingTable.Shell />
    </div>
  );
}
