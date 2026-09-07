import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ProfileDetails } from '@/components/staff/profile/profile-details';
import { MOCK_STAFF, MOCK_STAKE_PARTS } from '@/app/(dashboard)/_mock/staff';

/**
 * The profile tab — the cards only. Breadcrumbs, the identity band and the tab
 * bar live in `layout.tsx` and are not re-rendered when a tab changes.
 *
 * **Keeps its own `auth()` check.** The layout above has one too, but a layout
 * does not re-render on navigation, so it cannot be the guard — the Next docs
 * warn about exactly that, and this project's rule is a check per page anyway.
 */
export default async function StaffMockProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const staff = MOCK_STAFF[id];
  if (!staff) notFound();

  const filled = staff.id === 'mock-full';

  return (
    <ProfileDetails
      staff={staff}
      // Hidden, as an EDITOR would see it — the route decides, never a component
      showStake={false}
      stakeParts={filled ? MOCK_STAKE_PARTS : []}
      editHref={`/staff-mock/${id}/edit`}
    />
  );
}
