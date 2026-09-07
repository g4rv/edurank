import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Pencil, ArchiveX, ArchiveRestore } from 'lucide-react';
import { auth } from '@/lib/auth';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { AuroraButton } from '@/components/aurora/ui/button';
import { MockIdentityBand } from './mock-identity-band';
import { MockAccountBar } from './mock-account-bar';
import { StaffTabs } from '@/components/staff/staff-tabs';
import { fullName } from '@/components/staff/profile/primitives';
import { MOCK_STAFF, MOCK_ACCOUNTS } from '@/app/(dashboard)/_mock/staff';

/**
 * Everything that does NOT change when you switch tabs.
 *
 * Lives in a `(record)` route group so that `edit` — its sibling, one level up
 * — is NOT wrapped by it. A route group changes no URL: `/staff-mock/[id]` and
 * `/staff-mock/[id]/rating` are unaffected. What it buys is exactly what the
 * Next docs describe it for: «opting specific route segments into sharing a
 * layout, while keeping others out».
 *
 * Editing needs to be out. It is not a fourth view of a person, it is a task
 * you leave the record to perform — and rendering the identity band and the tab
 * bar above a form suggests you could wander off to «Рейтинг» mid-edit and come
 * back to your changes, which is not true.
 *
 * This is the whole point of the rehearsal. Next preserves a layout across
 * navigation between its children — from the docs: «On navigation, layouts
 * preserve state, remain interactive, and do not rerender», and «shared layouts
 * won't automatically be refetched on every navigation, only the page segment
 * that changes».
 *
 * So clicking Рейтинг re-renders the page below the tabs and nothing else: the
 * breadcrumbs, the identity band and the tab bar stay exactly where they are,
 * and the staff record behind them is not fetched again. Each tab still keeps
 * its own URL, so the back button and a bookmark both work — which client-side
 * tabs would have cost, along with fetching rating and характеристика data for
 * everybody who never opens them.
 *
 * ## The layout is NOT a guard
 *
 * Because it does not re-render, an auth check placed here would not run again
 * on a tab change. The Next docs warn about exactly this. The check below is
 * only so a signed-out visitor cannot see the chrome — **every `page.tsx` under
 * this layout keeps its own `auth()` and permission check**, which is already
 * this project's rule.
 */
export default async function StaffMockLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const staff = MOCK_STAFF[id];
  if (!staff) notFound();

  const archived = Boolean(staff.archivedAt);

  return (
    <AnimatedPage className="space-y-5">
      <Breadcrumbs items={[{ label: 'Персонал', href: '/staff' }, { label: fullName(staff) }]} />

      <MockIdentityBand
        staff={staff}
        account={MOCK_ACCOUNTS[id]}
        actions={
          <>
            {/* An archived record is read-only until it is restored — editing
                somebody off the roster only invites confusion about why their
                changes do not show up in the rating. */}
            {!archived && (
              <AuroraButton asChild variant="outline" size="sm">
                <Link href={`/staff-mock/${id}/edit`}>
                  <Pencil />
                  Редагувати
                </Link>
              </AuroraButton>
            )}
            <AuroraButton variant="outline" size="sm" disabled>
              {archived ? <ArchiveRestore /> : <ArchiveX />}
              {archived ? 'Відновити' : 'Архівувати'}
            </AuroraButton>
          </>
        }
      />

      {/* Tabs on the left, account management on the right — both are controls
          for this record, and the tab row's other half was empty. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* No `active` — the layout does not re-render, so the bar reads the
            pathname itself. See the note in StaffTabs. */}
        <StaffTabs staffId={id} showRating={staff.isNpp} basePath="/staff-mock" />
        <MockAccountBar staffId={id} account={MOCK_ACCOUNTS[id]} />
      </div>

      {children}
    </AnimatedPage>
  );
}
