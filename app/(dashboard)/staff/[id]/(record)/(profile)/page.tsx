import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getStakeBreakdown } from '@/lib/queries/get-stake-breakdown';
import { getStaffAccount } from '@/lib/queries/get-staff-account';
import { ProfileDetails } from '@/components/staff/profile/profile-details';
import { RecordTabRow } from '@/components/staff/profile/record-tab-row';
import { AccountControls } from '@/components/staff/account-card';
import { ToolbarGroup } from '@/components/staff/record-toolbar';
import { AccountBarShell } from '@/components/staff/profile/record-tab-row';

/**
 * The profile tab of one person's record.
 *
 * The breadcrumb and the identity band are `layout.tsx`'s. **The tab row is this
 * page's**, together with the account controls that sit on it — see
 * `RecordTabRow` for why a tab owns its own row.
 *
 * It used to hand-write its own `InfoCard`, `Field` and `PositionEntry` — as did
 * `/profile`, identically, so the same five cards came from two sources and a
 * spacing fix on one left the other behind. Both render `ProfileDetails` now.
 *
 * **Keeps its own `auth()` check.** The layout above has one too, but a layout
 * does not re-render on navigation, so it cannot be the guard — the Next docs
 * warn about exactly that, and this project's rule is a check per page anyway.
 */
export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role === 'USER') redirect('/profile');

  // A ставка is confidential: ADMIN, or the person themselves. An EDITOR never
  // sees one, however much else they may edit. The ROUTE answers this — a
  // component has no session, and a permission written twice will disagree.
  const isAdmin = session.user.role === 'ADMIN';
  const showStake = isAdmin || session.user.staffId === id;

  const staff = await getStaff(id, showStake);
  if (!staff) notFound();

  const stakeParts = showStake ? await getStakeBreakdown(id) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRow staffId={id} showRating={staff.isNpp}>
        {/* Only an ADMIN gets these, and only an ADMIN gets the placeholder —
            which is why the decision is HERE and not in `loading.tsx`. A
            loading file has no session, so a placeholder drawn there would show
            a grey bar to the tens of editors who will never get controls, to
            spare the couple of admins an empty corner.

            Behind its own `Suspense`, so the tab row and the cards below no
            longer wait on `getStaffAccount` before anything appears. */}
        {isAdmin && (
          <Suspense fallback={<AccountBarShell />}>
            <AccountBar staffId={id} isSelf={session.user.staffId === id} />
          </Suspense>
        )}
      </RecordTabRow>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <ProfileDetails
          staff={staff}
          showStake={showStake}
          stakeParts={stakeParts}
          editHref={`/staff/${id}/edit`}
        />
      </div>
    </div>
  );
}

/**
 * The account controls, loaded on their own.
 *
 * Its own async component so the row it sits in does not wait for it: the tab
 * bar and the cards render as soon as the record is read, and this fills in when
 * `getStaffAccount` answers. Local to this page — one caller is not a shared
 * component (§11 of `docs/aurora.md`).
 *
 * ADMIN-only, and the PAGE checks that before rendering it. This component has
 * no session and does not decide.
 */
async function AccountBar({ staffId, isSelf }: { staffId: string; isSelf: boolean }) {
  const account = await getStaffAccount(staffId);
  if (!account) return null;

  return (
    <ToolbarGroup>
      <AccountControls staffId={staffId} account={account} isSelf={isSelf} variant="bar" />
    </ToolbarGroup>
  );
}
