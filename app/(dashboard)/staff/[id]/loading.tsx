import {
  RecordChromeSkeleton,
  ProfileBodySkeleton,
} from '@/components/staff/profile/profile-skeleton';

/**
 * Opening a record from the list.
 *
 * **Outside the `(record)` group on purpose.** The layout in there awaits
 * `getStaff`, `getStaffAccount` and the editor's permissions, so a `loading.tsx`
 * inside it cannot render until the layout already has. Until 2026-09-09 there
 * was none out here, and the nearest boundary above was `staff/loading.tsx` —
 * so clicking a person showed the staff LIST skeleton, filter pills and a table,
 * over a page that is cards.
 *
 * `edit/` has its own and is unaffected: Next uses the nearest boundary to the
 * route being opened, not this one.
 */
export default function StaffRecordLoading() {
  return (
    <div className="space-y-5">
      <RecordChromeSkeleton />
      <ProfileBodySkeleton />
    </div>
  );
}
