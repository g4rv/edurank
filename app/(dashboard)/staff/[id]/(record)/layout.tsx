import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { canMutateStaffRecord } from '@/lib/permissions';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/aurora/ui/button';
import { ArchiveStaffButton, RestoreStaffButton } from '@/components/staff/archive-button';
import { IdentityBand } from '@/components/staff/profile/identity-band';
import { fullName } from '@/components/staff/profile/primitives';
import { StaffTabs } from '@/components/staff/staff-tabs';
import { RecordToolbarHost } from '@/components/staff/record-toolbar';
import { RatingViewProvider } from '@/components/rating/rating-view';

/**
 * Everything about one person that does NOT change when you switch tabs.
 *
 * In a `(record)` route group so that `edit` — its sibling, one level up — is
 * NOT wrapped by it. A route group changes no URL. Editing is not a fourth view
 * of a person, it is a task you leave the record to perform, and rendering the
 * identity band and the tab bar above a form suggests you could wander off to
 * «Рейтинг» mid-edit and come back to your changes, which is not true.
 *
 * Next preserves a layout across navigation between its children, so clicking a
 * tab re-renders only the body — the band, the breadcrumb and the tab bar stay
 * put and keep their state.
 *
 * ## It is not a guard
 *
 * A layout does not re-render on navigation, so `auth()` here runs once and
 * cannot be what protects the tabs. Every page keeps its own check; this one
 * exists so the layout has a session to render WITH, not to decide access. The
 * same rule the Next docs state and this project follows everywhere.
 */
export default async function StaffRecordLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';
  const showConfidential = isAdmin || session.user.staffId === id;

  const staff = await getStaff(id, showConfidential);
  if (!staff) notFound();

  let canEdit = isAdmin;
  let canArchive = isAdmin;
  if (role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'STAFF');
    // The entity permission says an editor may edit staff; `canMutateStaffRecord`
    // says WHOSE — USER records and their own, never an admin's. Both actions
    // re-check it, so showing the button on an admin's record only walked the
    // editor into «Недостатньо прав» after filling in the whole form.
    const target = { id: staff.id, role: staff.role };
    canEdit = perms.canUpdate && canMutateStaffRecord(session.user, target);
    // STAFF DELETE is the right to take someone off the roster, and archiving is
    // now the only thing that does, so it governs that.
    canArchive =
      perms.canDelete && canMutateStaffRecord(session.user, target, { allowSelf: false });
  }

  const archived = Boolean(staff.archivedAt);

  return (
    // The provider wraps the tab row AND the tab body: the «незаповнені» switch
    // is up here and the rows it hides are down there.
    //
    // `h-full` + a flex column, so a tab whose content is one scrolling card can
    // take the height that is left instead of guessing at it. `main` in the
    // dashboard shell is already bounded (`h-screen`); this is the link that was
    // missing between it and the card.
    <RatingViewProvider>
      <div className="flex h-full min-h-0 flex-col space-y-5">
        <Breadcrumbs items={[{ label: 'Персонал', href: '/staff' }, { label: fullName(staff) }]} />

        <IdentityBand
          staff={staff}
          actions={
            <>
              {/* An archived record is read-only until it is restored — editing
                  somebody off the roster only invites confusion about why their
                  changes do not show up in the rating. */}
              {canEdit && !archived && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/staff/${id}/edit`}>
                    <Pencil />
                    Редагувати
                  </Link>
                </Button>
              )}
              {canArchive &&
                (archived ? (
                  <RestoreStaffButton staffId={id} staffName={fullName(staff)} />
                ) : (
                  <ArchiveStaffButton staffId={id} staffName={fullName(staff)} />
                ))}
            </>
          }
        />

        {/* Tabs on the left; on the right, whatever the OPEN TAB puts there
            through the portal — and nothing else.

            Account management used to sit here beside it, which meant it rode
            along on Рейтинг and Характеристика too (owner, 2026-09-09). Those
            tabs are documents about a person; resetting their password from
            one is a different job that happens to be one row away. It belongs
            to the Профіль tab, which is where the record itself is, so the
            Профіль page portals it in like any other tab's controls. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* No `active` prop: a layout does not re-render on navigation, so one
              passed down here would be frozen on whichever tab was opened
              first. `StaffTabs` reads the pathname itself. */}
          <StaffTabs staffId={id} showRating={staff.isNpp} />
          <RecordToolbarHost />
        </div>

        {children}
      </div>
    </RatingViewProvider>
  );
}
