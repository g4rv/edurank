import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listQualifications } from '@/lib/queries/list-qualifications';
import { QualificationDialog } from '@/components/qualifications/qualification-dialog';
import { QualificationList } from '@/components/qualifications/qualification-list';
import { ProfileTabRow } from '@/components/staff/profile/profile-tab-row';
import { ToolbarGroup } from '@/components/staff/record-toolbar';

/**
 * «Підвищення кваліфікації/Стажування» — your own records, as a tab of your own
 * record (owner, 2026-10-13).
 *
 * **Being an НПП is what grants this**, not the USER role — the rule the
 * Характеристика uses. An administrative account has no such tab and is sent
 * back to the profile. The НПП writes freely here: add, edit and delete are all
 * theirs, and the actions check it again.
 */
export default async function MyQualificationsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (!staffId) redirect('/profile');

  const staff = await db.staff.findUnique({ where: { id: staffId }, select: { isNpp: true } });
  if (!staff?.isNpp) redirect('/profile');

  const rows = await listQualifications(staffId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRow isNpp>
        <ToolbarGroup>
          <QualificationDialog staffId={staffId} triggerClassName="rounded-md" />
        </ToolbarGroup>
      </ProfileTabRow>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <QualificationList staffId={staffId} rows={rows} canWrite />
      </div>
    </div>
  );
}
