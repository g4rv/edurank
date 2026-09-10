import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getStakeBreakdown } from '@/lib/queries/get-stake-breakdown';
import { EmptyState } from '@/components/aurora/ui/card';
import { ProfileDetails } from '@/components/staff/profile/profile-details';
import { ProfileTabRow } from '@/components/staff/profile/profile-tab-row';

/**
 * «Мій профіль» — the reader's own record.
 *
 * Built from `StaffProfileView` since 2026-09-08. It used to hand-write its own
 * `InfoCard`, `Field` and `PositionEntry`, as did `/staff/[id]` — the same five
 * cards from two separate sources, so a spacing fix on one left the other
 * behind. Both render the same components now; what still differs is what this
 * route DECIDES and hands down:
 *
 * - **`showStake` is unconditional here.** A ставка is confidential, and this is
 *   the one page where the reader is the subject. `/staff/[id]` grants it only to
 *   an ADMIN.
 * - **The tab row is this page's**, and the breadcrumb and band are the
 *   layout's. Рейтинг and Характеристика stopped being sidebar items on
 *   2026-09-09 and are siblings of this page now, so all three share
 *   `(record)/layout.tsx` — see its note for why a page renders its own row.
 * - **No rating block.** It carried five bars and a total (owner, 2026-09-09).
 *   «Мій рейтинг» is a sidebar item of its own that shows the whole thing, so
 *   the summary was a second, worse copy of a page one click away — and it sat
 *   above the record it was supposed to be a footnote to.
 *
 * The component decides none of that. It has no session, and a permission
 * written in two places is one that will eventually disagree.
 */
export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;

  // An account with no Staff row — an operator login, or a record deleted from
  // under a live session. There is nothing to render, so say so rather than 404.
  //
  // The breadcrumb is NOT repeated here: `ProfileHeader` draws it in the layout
  // and falls through to it alone when there is no person to band. Both drawing
  // it is how two trails ended up stacked on the record pages.
  if (!staffId) {
    return <EmptyState>Ваш профіль не знайдено. Зверніться до адміністратора.</EmptyState>;
  }

  const staff = await getStaff(staffId, true);
  if (!staff) notFound();

  const stakeParts = await getStakeBreakdown(staffId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRow isNpp={staff.isNpp} />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <ProfileDetails
          staff={staff}
          // Your own ставка is yours to see; every other reader of this record
          // needs to be an ADMIN. The route answers that, never the component.
          showStake
          stakeParts={stakeParts}
        />
      </div>
    </div>
  );
}
