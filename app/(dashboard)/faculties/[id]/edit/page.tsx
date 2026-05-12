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
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    if (role !== 'EDITOR') redirect('/faculties');

    const editorStaff = await db.staff.findUnique({
      where: { id: session?.user.staffId ?? '' },
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

  const [faculty, staff] = await Promise.all([
    db.faculty.findUnique({
      where: { id },
      select: { id: true, name: true, deanId: true },
    }),
    db.staff.findMany({
      select: { id: true, lastName: true, firstName: true, patronymic: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);

  if (!faculty) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/faculties"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Факультети
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
