import {
  BreadcrumbSkeleton,
  IdentityBandSkeleton,
  RecordTabsSkeleton,
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
 * The two wrappers repeat the record's own: `flex h-full min-h-0 flex-col
 * space-y-5` from the layout, and the Профіль tab's `min-h-0 flex-1 space-y-4
 * overflow-y-auto` around the body. Written out rather than shared, because a
 * `loading.tsx` cannot render the layout it is standing in for — and if either
 * of those changes, this is the file that has to follow.
 *
 * `edit/` has its own boundary and is unaffected: Next uses the nearest one to
 * the route being opened, not this one.
 */
export default function StaffRecordLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col space-y-5">
      <BreadcrumbSkeleton />
      <IdentityBandSkeleton />
      <RecordTabsSkeleton />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <ProfileBodySkeleton />
      </div>
    </div>
  );
}
