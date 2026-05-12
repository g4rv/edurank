import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { DepartmentForm } from '@/components/department/department-form';
import { createDepartment } from '@/app/(dashboard)/departments/actions';

export default async function NewDepartmentPage() {
  const session = await auth();
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') redirect('/departments');

    const editorStaff = await db.staff.findUnique({
      where: { id: session?.user.staffId ?? '' },
      select: { divisionId: true },
    });
    if (editorStaff?.divisionId) {
      const perm = await db.divisionEntityPermission.findFirst({
        where: {
          divisionId: editorStaff.divisionId,
          entity: 'DEPARTMENT',
          action: 'CREATE',
        },
      });
      if (!perm) redirect('/departments');
    } else {
      redirect('/departments');
    }
  }

  const [faculties, staff] = await Promise.all([
    db.faculty.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.staff.findMany({
      select: { id: true, lastName: true, firstName: true, patronymic: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/departments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Кафедри
      </Link>

      <h1 className="text-2xl font-semibold">Нова кафедра</h1>

      <DepartmentForm
        faculties={faculties}
        staff={staff}
        action={createDepartment}
        submitLabel="Створити"
      />
    </div>
  );
}
