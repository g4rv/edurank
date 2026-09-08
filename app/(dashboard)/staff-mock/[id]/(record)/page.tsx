import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { ProfileDetails } from '@/components/staff/profile/profile-details';
import { Button } from '@/components/aurora/ui/button';
import { MOCK_STAFF, MOCK_STAKE_PARTS } from '@/app/(dashboard)/_mock/staff';

/**
 * The profile tab — the cards only. Breadcrumbs, the identity band and the tab
 * bar live in `layout.tsx` and are not re-rendered when a tab changes.
 *
 * **Keeps its own `auth()` check.** The layout above has one too, but a layout
 * does not re-render on navigation, so it cannot be the guard — the Next docs
 * warn about exactly that, and this project's rule is a check per page anyway.
 *
 * ## `?as=` — the two audiences, side by side
 *
 * This page has always rendered the EDITOR's view, and there was no way to see
 * the other one (owner, 2026-09-07). Two things exist only for ADMIN and both
 * change the shape of the page, so a rehearsal that omits them is rehearsing
 * the smaller half:
 *
 * - **«Ставка»** — confidential. `/staff/[id]` gates it on
 *   `isAdmin || session.user.staffId === id`.
 * - **The account** — role, activation, invitation, password reset, force
 *   logout, lockout. It is the whole of «profile management». It used to be a
 *   card at the top of the right column and is now a strip along the foot of
 *   the identity band (owner, 2026-09-07) — the card was several times wider
 *   than its own contents needed. `mock-identity-band.tsx` renders it.
 *
 * A search param rather than a toggle, because **the route decides and a
 * component never does** — the same rule the real page follows. It also has to
 * be here rather than in the layout: `searchParams` reach `page.tsx` only, and
 * a layout does not re-render when they change. So «Редагувати» / «Архівувати»
 * in the band above stay as they are; what switches is everything this page
 * owns.
 */
export default async function StaffMockProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const staff = MOCK_STAFF[id];
  if (!staff) notFound();

  // Anything but «admin» is the editor's view, so a typo shows the SMALLER
  // page rather than accidentally revealing the confidential one.
  const asAdmin = (await searchParams).as === 'admin';
  const filled = staff.id === 'mock-full';

  return (
    <div className="space-y-4">
      <ViewAs id={id} asAdmin={asAdmin} />

      <ProfileDetails
        staff={staff}
        // The route decides, never a component
        showStake={asAdmin}
        stakeParts={filled ? MOCK_STAKE_PARTS : []}
        editHref={`/staff-mock/${id}/edit`}
      />
    </div>
  );
}

/**
 * Which audience is being rehearsed. Dashed and labelled «Макет» so it cannot
 * be mistaken for part of the design it sits above.
 */
function ViewAs({ id, asAdmin }: { id: string; asAdmin: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">Макет — показано як:</span>

      <Button asChild size="xs" variant={asAdmin ? 'default' : 'ghost'}>
        <Link href={`/staff-mock/${id}?as=admin`}>Адміністратор</Link>
      </Button>
      <Button asChild size="xs" variant={asAdmin ? 'ghost' : 'default'}>
        <Link href={`/staff-mock/${id}`}>Редактор</Link>
      </Button>

      <span className="ml-auto text-xs text-muted-foreground">
        {asAdmin
          ? 'Ставка й керування обліковим записом — лише адміністратор'
          : 'Ставка й керування обліковим записом приховані'}
      </span>
    </div>
  );
}
