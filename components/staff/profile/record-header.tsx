import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getStaffAccount } from '@/lib/queries/get-staff-account';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { canViewAcademicRecord } from '@/lib/queries/scope';
import { canMutateStaffRecord } from '@/lib/permissions';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/aurora/ui/button';
import { ArchiveStaffButton, RestoreStaffButton } from '@/components/staff/archive-button';
import { IdentityBand, ActivationBadge } from '@/components/staff/profile/identity-band';
import { fullName } from './primitives';

/**
 * Who this record is, and what may be done to it — the breadcrumb and the band.
 *
 * **Its own async component so the LAYOUT does not have to be one.** Until
 * 2026-09-09 `(record)/layout.tsx` awaited this work itself, and that is what
 * broke loading across the whole record: a layout that suspends holds back
 * everything under it, so each tab's own `loading.tsx` could never render and
 * Next fell back to the one boundary above — which cannot know which tab is
 * opening, and drew the Профіль's cards over the Характеристика's table.
 *
 * Pulled out and wrapped in `Suspense`, it suspends alone. The tab bar, the
 * toolbar and the tab body each have their own boundary and arrive when their
 * own data does.
 */
export async function RecordHeader({ id }: { id: string }) {
  const session = await auth();
  if (!session) redirect('/login');

  const isAdmin = session.user.role === 'ADMIN';

  // **Not a blanket bounce of every USER** (2026-09-10). Headship is not a
  // `Role` — a завідувач is an ordinary USER — and the Характеристика tab under
  // this header is explicitly theirs to read: `/my-department` links every one
  // of their people straight to it. Until this layout existed that page stood
  // alone and nothing stopped them; a header that redirected on the role alone
  // took it away, before the page's own `canViewAcademicRecord` could answer.
  //
  // So the header applies the WIDEST rule any tab beneath it allows, and each
  // page narrows it further — the Профіль and Рейтинг tabs still send a USER to
  // their own record. ADMIN and EDITOR short-circuit inside the helper, so this
  // costs a query for a head and nobody else.
  if (session.user.role === 'USER' && !(await canViewAcademicRecord(session.user, id))) {
    redirect('/profile');
  }

  const showConfidential = isAdmin || session.user.staffId === id;

  const staff = await getStaff(id, showConfidential);
  if (!staff) notFound();

  // «Активовано» is a fact about the person, like «Архівований» beside it, so it
  // belongs on the band (owner, asked twice — 2026-09-09). Only an ADMIN may
  // know it, and only an ADMIN loads the row.
  const account = isAdmin ? await getStaffAccount(id) : null;

  let canEdit = isAdmin;
  let canArchive = isAdmin;
  if (session.user.role === 'EDITOR') {
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
    <>
      <Breadcrumbs items={[{ label: 'Персонал', href: '/staff' }, { label: fullName(staff) }]} />
      <IdentityBand
        staff={staff}
        badges={account ? <ActivationBadge activated={account.isActivated} /> : null}
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
    </>
  );
}
