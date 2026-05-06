import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listDepartments } from '@/lib/queries/list-departments';
import { listDivisions } from '@/lib/queries/list-divisions';
import { StaffCreateForm } from '@/components/staff/create-form';

export default async function StaffNewPage() {
  const [session, departments, divisions] = await Promise.all([
    auth(),
    listDepartments(),
    listDivisions(),
  ]);

  const role = session?.user.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') redirect('/staff');

    const editorStaff = await db.staff.findUnique({
      where: { id: session?.user.staffId ?? '' },
      select: { divisionId: true },
    });

    const hasPermission = editorStaff?.divisionId
      ? await db.divisionEntityPermission.findFirst({
          where: {
            divisionId: editorStaff.divisionId,
            entity: 'STAFF',
            action: 'CREATE',
          },
        })
      : null;

    if (!hasPermission) redirect('/staff');
  }

  return (
    <div className="space-y-6">
      <Link
        href="/staff"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Співробітники
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Новий співробітник</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Заповніть дані нового запису</p>
      </div>

      <StaffCreateForm departments={departments} divisions={divisions} isAdmin={isAdmin} />
    </div>
  );
}
