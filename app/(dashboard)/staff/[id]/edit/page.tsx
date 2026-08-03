import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { listDepartments } from '@/lib/queries/list-departments';
import { listDivisions } from '@/lib/queries/list-divisions';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { canMutateStaffRecord } from '@/lib/permissions';
import { StaffEditForm } from '@/components/staff/edit-form';

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';
  const isEditor = role === 'EDITOR';

  if (!isAdmin && !isEditor) redirect(`/staff/${id}`);

  if (isEditor) {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'STAFF');
    if (!perms.canUpdate) redirect(`/staff/${id}`);
  }

  const [staff, departments, divisions] = await Promise.all([
    getStaff(id, isAdmin),
    listDepartments(),
    // Only ADMIN may assign a відділ, and the names must not reach anyone else:
    // a prop is serialised into the page payload whether the control that would
    // use it is rendered or not.
    isAdmin ? listDivisions() : Promise.resolve([]),
  ]);

  if (!staff) notFound();

  // Whose record it is decides as much as which fields: an editor may edit USER
  // records and their own, never an admin's. updateStaff refuses it anyway —
  // this stops the form being offered at all rather than after it is filled in.
  if (!canMutateStaffRecord(session.user, { id: staff.id, role: staff.role })) {
    redirect(`/staff/${id}`);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/staff/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Профіль
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Редагування</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {staff.lastName} {staff.firstName} {staff.patronymic}
        </p>
      </div>

      <StaffEditForm
        staff={staff}
        departments={departments}
        divisions={divisions}
        isAdmin={isAdmin}
        staffId={id}
      />
    </div>
  );
}
