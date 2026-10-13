import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canOverseeScience } from '@/lib/science/oversight';
import {
  canViewAnyQualifications,
  divisionAllowsQualifications,
  qualificationAccessFor,
} from '@/lib/qualifications/access';
import { listQualifications } from '@/lib/queries/list-qualifications';
import { QualificationDialog } from '@/components/qualifications/qualification-dialog';
import { QualificationList } from '@/components/qualifications/qualification-list';
import { RecordTabRow } from '@/components/staff/profile/record-tab-row';
import { ToolbarDivider, ToolbarGroup } from '@/components/staff/record-toolbar';
import { DownloadButton } from '@/components/ui/download-button';

/**
 * «Підвищення кваліфікації/Стажування» of one НПП, as somebody else sees it
 * (owner, 2026-10-13).
 *
 * **ADMIN, or an EDITOR whose division carries `canViewQualifications`** — and
 * for everybody else this route does not exist: `notFound`, not a redirect, the
 * same as an unknown id, so it does not confirm the person has records. A
 * завідувач and a декан see nothing here.
 *
 * ADMIN may also add, edit and delete (`access.write`); the division switch is
 * read-only, so those editors get the file link and no controls. Administrative
 * staff have no records at all.
 */
export default async function StaffQualificationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  // Your own records belong on your own profile, which is where you write them.
  if (session.user.staffId === id && session.user.role === 'USER') {
    redirect('/profile/qualifications');
  }

  const owner = await db.staff.findUnique({ where: { id }, select: { isNpp: true } });
  if (!owner?.isNpp) notFound();

  const access = qualificationAccessFor({
    role: session.user.role,
    staffId: session.user.staffId,
    divisionAllows: await divisionAllowsQualifications(session.user),
    ownerId: id,
    ownerIsNpp: owner.isNpp,
  });
  if (!access.read) notFound();

  // Exporting is for the people who may READ everybody's records — ADMIN and an
  // allowed division — not for the НПП, who has no such page here. The route
  // asks the same rule again.
  const [rows, showScience, canExport] = await Promise.all([
    listQualifications(id),
    canOverseeScience(session.user),
    canViewAnyQualifications(session.user),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <RecordTabRow staffId={id} showRating showScience={showScience} showQualifications>
        {(canExport || access.write) && (
          <ToolbarGroup>
            {canExport && (
              <DownloadButton
                href={`/api/export/qualifications?staffId=${id}`}
                label="Вивантажити Excel"
                // Nothing to put in the file — an empty sheet with only a header
                // is not worth a download.
                disabled={rows.length === 0}
                title={
                  rows.length === 0
                    ? 'Немає записів для вивантаження'
                    : 'Підвищення кваліфікації та стажування цього працівника'
                }
                className="rounded-md"
              />
            )}
            {canExport && access.write && <ToolbarDivider />}
            {access.write && <QualificationDialog staffId={id} triggerClassName="rounded-md" />}
          </ToolbarGroup>
        )}
      </RecordTabRow>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <QualificationList staffId={id} rows={rows} canWrite={access.write} />
      </div>
    </div>
  );
}
