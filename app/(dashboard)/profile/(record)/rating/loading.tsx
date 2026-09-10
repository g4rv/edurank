import { ProfileTabRowSkeleton } from '@/components/staff/profile/profile-tab-row';
import { RatingTable } from '@/components/rating/rating-table';

/** «Мій рейтинг» — the real headings and «Загальна сума балів», values shimmering. */
export default function MyRatingLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRowSkeleton toolbar="rating" />
      <RatingTable.Shell />
    </div>
  );
}
