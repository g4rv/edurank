import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { DepartmentForm } from '@/components/department/department-form';
import { updateDepartment } from '@/app/(dashboard)/departments/actions';

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') redirect('/departments');

    const editorStaff = await db.staff.findUnique({
      where: { id: session.user.staffId ?? '' },
      select: { divisionId: true },
    });
    if (editorStaff?.divisionId) {
      const perm = await db.divisionEntityPermission.findFirst({
        where: {
          divisionId: editorStaff.divisionId,
          entity: 'DEPARTMENT',
          action: 'UPDATE',
        },
      });
      if (!perm) redirect('/departments');
    } else {
      redirect('/departments');
    }
  }

  const [department, faculties, takenDeanRows, takenHeadRows, allStaff] = await Promise.all([
    db.department.findUnique({
      where: { id },
      select: { id: true, name: true, facultyId: true, headId: true },
    }),
    db.faculty.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.faculty.findMany({ select: { deanId: true }, where: { deanId: { not: null } } }),
    db.department.findMany({
      select: { headId: true },
      where: { headId: { not: null }, id: { not: id } },
    }),
    db.staff.findMany({
      // Nobody archived can be picked as a head or a dean — they are off the
      // roster, and an archived person cannot even sign in.
      where: ON_ROSTER,
      select: { id: true, lastName: true, firstName: true, patronymic: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);
  const takenIds = new Set([
    ...takenDeanRows.map((r) => r.deanId as string),
    ...takenHeadRows.map((r) => r.headId as string),
  ]);
  // keep the current head available even if they're a dean elsewhere
  if (department?.headId) takenIds.delete(department.headId);
  const staff = allStaff.filter((s) => !takenIds.has(s.id));

  if (!department) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href={`/departments/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {department.name}
      </Link>

      <h1 className="text-2xl font-semibold">Редагувати: {department.name}</h1>

      <DepartmentForm
        faculties={faculties}
        staff={staff}
        defaultValues={{
          name: department.name,
          facultyId: department.facultyId,
          headId: department.headId,
        }}
        action={updateDepartment.bind(null, id)}
        submitLabel="Зберегти"
      />
    </div>
  );
}
