import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { FacultyForm } from '@/components/faculty/faculty-form';
import { createFaculty } from '@/app/(dashboard)/faculties/actions';

export default async function NewFacultyPage() {
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
        where: { divisionId: editorStaff.divisionId, entity: 'FACULTY', action: 'CREATE' },
      });
      if (!perm) redirect('/faculties');
    } else {
      redirect('/faculties');
    }
  }

  const [takenDeanRows, takenHeadRows, allStaff] = await Promise.all([
    db.faculty.findMany({ select: { deanId: true }, where: { deanId: { not: null } } }),
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
  const staff = allStaff.filter((s) => !takenIds.has(s.id));

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href="/faculties"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Факультети
      </Link>

      <h1 className="text-2xl font-semibold">Новий факультет</h1>

      <FacultyForm staff={staff} action={createFaculty} submitLabel="Створити" />
    </div>
  );
}
