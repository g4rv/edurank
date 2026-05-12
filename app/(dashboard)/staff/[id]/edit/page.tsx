import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { listDepartments } from '@/lib/queries/list-departments';
import { listDivisions } from '@/lib/queries/list-divisions';
import { StaffEditForm } from '@/components/staff/edit-form';

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, staff, departments, divisions] = await Promise.all([
    auth(),
    getStaff(id),
    listDepartments(),
    listDivisions(),
  ]);

  if (!staff) notFound();

  const role = session?.user.role;
  const isAdmin = role === 'ADMIN';
  const isEditor = role === 'EDITOR';

  if (!isAdmin && !isEditor) redirect(`/staff/${id}`);

  return (
    <div className="space-y-6">
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
