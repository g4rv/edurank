import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listFaculties } from '@/lib/queries/list-faculties';
import { Button } from '@/components/ui/button';
import { DeleteFacultyButton } from '@/components/faculty/delete-button';

function deanName(dean: { lastName: string; firstName: string; patronymic: string } | null) {
  if (!dean) return '—';
  return `${dean.lastName} ${dean.firstName} ${dean.patronymic}`;
}

export default async function FacultiesPage() {
  const session = await auth();
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const faculties = await listFaculties();
  const isAdmin = role === 'ADMIN';

  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const editorStaff = await db.staff.findUnique({
      where: { id: session?.user.staffId ?? '' },
      select: { divisionId: true },
    });
    const divisionId = editorStaff?.divisionId;

    if (divisionId) {
      const [createPerm, updatePerm, deletePerm] = await Promise.all([
        db.divisionEntityPermission.findFirst({
          where: { divisionId, entity: 'FACULTY', action: 'CREATE' },
        }),
        db.divisionEntityPermission.findFirst({
          where: { divisionId, entity: 'FACULTY', action: 'UPDATE' },
        }),
        db.divisionEntityPermission.findFirst({
          where: { divisionId, entity: 'FACULTY', action: 'DELETE' },
        }),
      ]);
      canCreate = !!createPerm;
      canEdit = !!updatePerm;
      canDelete = !!deletePerm;
    }
  }

  const showActions = canEdit || canDelete;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Факультети</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{faculties.length} записів</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/faculties/new">Додати</Link>
          </Button>
        )}
      </div>

      {faculties.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Факультетів не знайдено
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Назва</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Декан</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Кафедри</th>
                {showActions && (
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Дії</th>
                )}
              </tr>
            </thead>
            <tbody>
              {faculties.map((faculty) => (
                <tr
                  key={faculty.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{faculty.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{deanName(faculty.dean)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{faculty._count.departments}</td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex items-start justify-end gap-2">
                        {canEdit && (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/faculties/${faculty.id}/edit`}>
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                        )}
                        {canDelete && (
                          <DeleteFacultyButton facultyId={faculty.id} facultyName={faculty.name} />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
