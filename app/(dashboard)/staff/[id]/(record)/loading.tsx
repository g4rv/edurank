import { ProfileBodySkeleton } from '@/components/staff/profile/profile-skeleton';

/**
 * Switching back to the Профіль tab.
 *
 * **The body alone.** This boundary is inside the record's `layout.tsx`, so by
 * the time it renders the breadcrumb, the identity band and the tab bar are
 * already on screen and keep their state. It used to draw its own breadcrumb
 * and its own name-and-buttons header, which appeared UNDER the real ones — two
 * headers stacked, on every tab switch.
 */
export default function StaffProfileTabLoading() {
  return <ProfileBodySkeleton />;
}
