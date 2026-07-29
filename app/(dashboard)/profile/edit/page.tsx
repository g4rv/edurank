import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { ProfileEditForm } from '@/components/profile/profile-edit-form';

// Open to every role: the only claim it checks is that the record is yours, and
// the action writes nothing outside USER_EDITABLE_STAFF_FIELDS. ADMIN and EDITOR
// reach the full form through /staff/[id]/edit instead — see the button on
// /profile — so this page stays the same narrow one for everybody who lands on it.
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
          Контактні дані та посилання на наукові профілі
        </p>
      </div>

      <ProfileEditForm
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
