import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getStakeBreakdown } from '@/lib/queries/get-stake-breakdown';
import { getStaffAccount } from '@/lib/queries/get-staff-account';
import { ProfileDetails } from '@/components/staff/profile/profile-details';
import { AccountControls } from '@/components/staff/account-card';
import { RecordToolbar, ToolbarGroup } from '@/components/staff/record-toolbar';

/**
 * The profile tab of one person's record.
 *
 * The breadcrumb, the identity band and the tab bar are `layout.tsx`'s and are
 * not re-rendered when a tab changes; this page is only the cards.
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
  const showStake = session.user.role === 'ADMIN' || session.user.staffId === id;

  const staff = await getStaff(id, showStake);
  if (!staff) notFound();

  const stakeParts = showStake ? await getStakeBreakdown(id) : [];

  // Account management is the whole of «profile management» and is ADMIN-only,
  // so nobody else's page even loads the row. It lives on THIS tab rather than
  // in the layout (owner, 2026-09-09): Рейтинг and Характеристика are documents
  // about a person, and «Завершити всі сесії» has no business on the row above
  // one. The record — who they are, what they may sign in as — is here.
  const account = session.user.role === 'ADMIN' ? await getStaffAccount(id) : null;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      {account && (
        <RecordToolbar>
          <ToolbarGroup>
            <AccountControls
              staffId={id}
              account={account}
              isSelf={session.user.staffId === id}
              variant="bar"
            />
          </ToolbarGroup>
        </RecordToolbar>
      )}

      <ProfileDetails
        staff={staff}
        showStake={showStake}
        stakeParts={stakeParts}
        editHref={`/staff/${id}/edit`}
      />
    </div>
  );
}
