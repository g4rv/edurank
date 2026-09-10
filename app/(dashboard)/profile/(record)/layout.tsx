import { Suspense } from 'react';
import { ProfileHeader } from '@/components/staff/profile/profile-header';
import { RecordHeaderSkeleton } from '@/components/staff/profile/profile-skeleton';
import { RatingViewProvider } from '@/components/rating/rating-view';

/**
 * Everything about YOUR record that does not change when you switch tabs.
 *
 * **The mirror of `staff/[id]/(record)/layout.tsx`, deliberately** (owner,
 * 2026-09-09). «Мій рейтинг» and «Характеристика» used to be sidebar items
 * pointing at `/achievements`, so a person's own record was three unrelated
 * pages while somebody else's was one record with three tabs. They are tabs now,
 * and the routes moved under `/profile` so the three are real siblings rather
 * than a tab bar reaching across two route trees.
 *
 * `edit` is outside this group for the same reason it is on a record: editing is
 * a task you leave the record to perform, not a fourth view of it.
 *
 * Fetches nothing itself — `ProfileHeader` is its own async component behind
 * `Suspense`, so a suspended header does not hold back the tab below it.
 */
export default function ProfileRecordLayout({ children }: { children: React.ReactNode }) {
  return (
    <RatingViewProvider>
      <div className="flex h-full min-h-0 flex-col space-y-5">
        <Suspense fallback={<RecordHeaderSkeleton actions={1} />}>
          <ProfileHeader />
        </Suspense>

        {children}
      </div>
    </RatingViewProvider>
  );
}
