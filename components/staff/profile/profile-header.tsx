import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/aurora/ui/button';
import { IdentityBand } from '@/components/staff/profile/identity-band';

/**
 * Who you are — the breadcrumb and the band on «Мій профіль» and its tabs.
 *
 * The same shape as `RecordHeader`, and its own async component for the same
 * reason: a layout that awaits holds back everything under it, so each tab's own
 * `loading.tsx` could never render. Behind `Suspense` it suspends alone.
 *
 * What differs from a record, and why the two are not one component: this one
 * has no `id` — it is always the signed-in person — the ставка is theirs to see
 * unconditionally, the only action is «Редагувати», and there is no account
 * management, no archiving and no «Активовано» badge. Those are things done TO
 * somebody by an administrator, and none of them belong on your own page.
 */
export async function ProfileHeader() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;

  // An ADMIN or EDITOR reaches their own record from «Персонал» as well as from
  // the sidebar, so for them the list is a real ancestor. For an НПП it is not a
  // page they may open, and the trail starts at the sidebar group instead.
  const crumbs =
    session.user.role !== 'USER'
      ? [{ label: 'Персонал', href: '/staff' }, { label: 'Мій профіль' }]
      : [{ label: 'Особисте' }, { label: 'Мій профіль' }];

  // **An account with no Staff row gets the trail and nothing else** — an
  // operator login, or a record deleted from under a live session. `notFound()`
  // here used to swallow the page's own «Ваш профіль не знайдено. Зверніться до
  // адміністратора.», because a header that 404s takes the whole route with it
  // and the page below never renders (2026-09-10). The band needs a person and
  // there is none, so it is skipped; the page says the rest.
  if (!staffId) return <Breadcrumbs items={crumbs} />;

  const staff = await getStaff(staffId, true);
  if (!staff) notFound();

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <IdentityBand
        staff={staff}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/edit">
              <Pencil />
              Редагувати
            </Link>
          </Button>
        }
      />
    </>
  );
}
