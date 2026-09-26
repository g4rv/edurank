import { RecordTabRowSkeleton } from '@/components/staff/profile/record-tab-row';
import { ProfileBodySkeleton } from '@/components/staff/profile/profile-skeleton';

/**
 * The Профіль tab.
 *
 * **In a `(profile)` route group, and that is load-bearing.** A `loading.tsx`
 * covers its own segment AND everything beneath it — so while this sat directly
 * in `(record)/` it was the boundary for `rating` and `kharakterystyka` too, and
 * a hard load of either drew the ACCOUNT bar's placeholder over the wrong tab.
 * Exactly the trap `staff/loading.tsx` fell into over `staff/[id]`, and the same
 * one-folder fix. A route group changes no URL.
 *
 * **The row is drawn with no toolbar at all** (2026-09-10). The Профіль tab's
 * only controls are the account ones, an ADMIN is the only reader who gets
 * them, and a loading file has no session to ask — so a shell here showed a
 * grey strip to the tens of editors who will never receive it, to spare the
 * couple of admins an empty corner. The page decides instead, and loses
 * nothing by it: `page.tsx` wraps `AccountBar` in its own `Suspense` with
 * `AccountBarShell` as the fallback, so an admin still gets the placeholder —
 * one render later, from the component that knows who is reading.
 *
 * This is the opposite call from the band above, on purpose. «Редагувати» is
 * right for every admin and most editors, so it is printed; the account strip
 * is right for two people in the university.
 */
export default function StaffProfileTabLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRowSkeleton />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <ProfileBodySkeleton />
      </div>
    </div>
  );
}
