import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { ProfileEditForm } from '@/components/profile/profile-edit-form';
import { headshipOf } from '@/lib/staff/academic';
import { academicToFormValues } from '@/components/staff/academic-form-values';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { profileCrumbs } from '@/components/staff/profile/profile-crumbs';
import { fullName } from '@/components/staff/profile/primitives';
import { avatarSrc, canSetOwnAvatar } from '@/lib/staff/avatar';

// The one place a person edits themselves, whatever their role: the only claim
// it checks is that the record is yours, and the action writes nothing outside
// USER_EDITABLE_STAFF_FIELDS.
//
// An admin who needs to change their own ПІБ, кафедра or ставка goes through
// Персонал like they would for anyone else. That is an administrative act on a
// staff record, and keeping it there is what stops this page needing to know
// about roles at all.
export default async function ProfileEditPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (!staffId) notFound();

  const staff = await getStaff(staffId, true);
  if (!staff) notFound();

  return (
    // No heading of its own — the form carries one in its header card, beside
    // the actions it belongs with.
    <div className="space-y-5">
      {/* Three levels, not two. This hardcoded «Мій профіль › Редагування» and
          dropped whichever root the role gets, so walking from /profile to
          /profile/edit lost a level instead of gaining one. */}
      <Breadcrumbs items={profileCrumbs(session.user.role, 'Редагування')} />

      <ProfileEditForm
        name={fullName(staff)}
        avatarSrc={avatarSrc(staff)}
        canEditAvatar={canSetOwnAvatar(session.user.role)}
        isNpp={staff.isNpp}
        headship={headshipOf(staff)}
        defaultValues={{
          phone: staff.phone ?? '',
          wosUrl: staff.wosUrl ?? '',
          scopusUrl: staff.scopusUrl ?? '',
          googleScholarUrl: staff.googleScholarUrl ?? '',
          orcidId: staff.orcidId ?? '',
          wosCitationCount: staff.wosCitationCount != null ? String(staff.wosCitationCount) : '',
          scopusCitationCount:
            staff.scopusCitationCount != null ? String(staff.scopusCitationCount) : '',
          googleScholarCitationCount:
            staff.googleScholarCitationCount != null
              ? String(staff.googleScholarCitationCount)
              : '',
          // Only an НПП's own academic info is theirs to edit (2026-10-06).
          ...(staff.isNpp ? academicToFormValues(staff) : {}),
        }}
      />
    </div>
  );
}
