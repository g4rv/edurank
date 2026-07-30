import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { AnimatedPage } from '@/components/ui/animated-page';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DeleteFacultyButton } from '@/components/faculty/delete-button';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';

function fullName(p: { lastName: string; firstName: string; patronymic: string }) {
  return `${p.lastName} ${p.firstName} ${p.patronymic}`;
}

export default async function FacultyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const faculty = await db.faculty.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      dean: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
      departments: {
        select: { id: true, name: true, _count: { select: { primaryStaff: true } } },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!faculty) notFound();

  const staffList = await db.staff.findMany({
    where: { department: { facultyId: id }, isNpp: true },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      academicRank: true,
      scientificDegree: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const isAdmin = role === 'ADMIN';
  let canEdit = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'FACULTY');
    canEdit = perms.canUpdate;
    canDelete = perms.canDelete;
  }

  return (
    <AnimatedPage className="space-y-6">
      <Link
        href="/faculties"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Факультети
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{faculty.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {staffList.length} НПП · {faculty.departments.length} кафедр
          </p>
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-start gap-2">
            {canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/faculties/${id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
            {canDelete && <DeleteFacultyButton facultyId={id} facultyName={faculty.name} />}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Декан
          </p>
          {faculty.dean ? (
            <Link
              href={`/staff/${faculty.dean.id}`}
              className="text-sm font-medium hover:underline"
            >
              {fullName(faculty.dean)}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Не призначено</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Кафедри ({faculty.departments.length})
          </p>
          {faculty.departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Кафедр немає</p>
          ) : (
            <ul className="space-y-2">
              {faculty.departments.map((dept) => (
                <li key={dept.id} className="flex items-center justify-between">
                  <Link href={`/departments/${dept.id}`} className="text-sm hover:underline">
                    {dept.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {dept._count.primaryStaff} НПП
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {staffList.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">НПП факультету</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ПІБ</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Кафедра</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Звання / ступінь
                </th>
              </tr>
            </thead>
            <AnimatedTableBody>
              {staffList.map((member) => (
                <AnimatedRow
                  key={member.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="relative px-4 py-3 font-medium">
                    <Link href={`/staff/${member.id}`} className="absolute inset-0" />
                    {fullName(member)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.department?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.academicRank
                      ? [
                          ACADEMIC_RANK_LABELS[member.academicRank],
                          member.scientificDegree
                            ? SCIENTIFIC_DEGREE_LABELS[member.scientificDegree]
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : '—'}
                  </td>
                </AnimatedRow>
              ))}
            </AnimatedTableBody>
          </table>
        </div>
      )}
    </AnimatedPage>
  );
}
