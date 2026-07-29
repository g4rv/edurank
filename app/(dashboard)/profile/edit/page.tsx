import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { ProfileEditForm } from '@/components/profile/profile-edit-form';

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
    <div className="max-w-2xl space-y-6">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Мій профіль
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Редагування профілю</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {staff.isNpp ? 'Контактні дані та посилання на наукові профілі' : 'Контактні дані'}
        </p>
      </div>

      <ProfileEditForm
        isNpp={staff.isNpp}
        defaultValues={{
          phone: staff.phone ?? '',
          wosUrl: staff.wosUrl ?? '',
          scopusUrl: staff.scopusUrl ?? '',
          googleScholarUrl: staff.googleScholarUrl ?? '',
          orcidId: staff.orcidId ?? '',
        }}
      />
    </div>
  );
}
