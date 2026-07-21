import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { FacultyForm } from '@/components/faculty/faculty-form';
import { updateFaculty } from '@/app/(dashboard)/faculties/actions';

export default async function EditFacultyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') redirect('/faculties');

    const editorStaff = await db.staff.findUnique({
      where: { id: session.user.staffId ?? '' },
      select: { divisionId: true },
    });
    if (editorStaff?.divisionId) {
      const perm = await db.divisionEntityPermission.findFirst({
        where: { divisionId: editorStaff.divisionId, entity: 'FACULTY', action: 'UPDATE' },
      });
      if (!perm) redirect('/faculties');
    } else {
      redirect('/faculties');
    }
  }

  const [faculty, takenDeanRows, takenHeadRows, allStaff] = await Promise.all([
    db.faculty.findUnique({ where: { id }, select: { id: true, name: true, deanId: true } }),
    db.faculty.findMany({
      select: { deanId: true },
      where: { deanId: { not: null }, id: { not: id } },
    }),
    db.department.findMany({ select: { headId: true }, where: { headId: { not: null } } }),
    db.staff.findMany({
      select: { id: true, lastName: true, firstName: true, patronymic: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);
  const takenIds = new Set([
    ...takenDeanRows.map((r) => r.deanId as string),
    ...takenHeadRows.map((r) => r.headId as string),
  ]);
  // keep the current dean available even if they're a head elsewhere
  if (faculty?.deanId) takenIds.delete(faculty.deanId);
  const staff = allStaff.filter((s) => !takenIds.has(s.id));

  if (!faculty) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href={`/faculties/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {faculty.name}
      </Link>

      <h1 className="text-2xl font-semibold">Редагувати: {faculty.name}</h1>

      <FacultyForm
        staff={staff}
        defaultValues={{ name: faculty.name, deanId: faculty.deanId }}
        action={updateFaculty.bind(null, id)}
        submitLabel="Зберегти"
      />
    </div>
  );
}
