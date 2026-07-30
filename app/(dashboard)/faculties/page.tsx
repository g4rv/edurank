import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { listFaculties } from '@/lib/queries/list-faculties';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { Button } from '@/components/ui/button';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { SortTh } from '@/components/ui/sort-th';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DataTable } from '@/components/ui/data-table';
import { DeleteFacultyButton } from '@/components/faculty/delete-button';

function deanName(dean: { lastName: string; firstName: string; patronymic: string } | null) {
  if (!dean) return '—';
  return `${dean.lastName} ${dean.firstName} ${dean.patronymic}`;
}

export default async function FacultiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { dir } = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const sortDir = dir === 'desc' ? 'desc' : 'asc';
  const faculties = await listFaculties({ dir: sortDir });
  const isAdmin = role === 'ADMIN';

  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'FACULTY');
    canCreate = perms.canCreate;
    canEdit = perms.canUpdate;
    canDelete = perms.canDelete;
  }

  const showActions = canEdit || canDelete;
  const nextDir = sortDir === 'asc' ? 'desc' : 'asc';

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
        <DataTable>
          <thead>
            <tr className="border-b bg-muted/40">
              <SortTh label="Назва" href={`/faculties?dir=${nextDir}`} active dir={sortDir} />
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Декан</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Кафедри</th>
              {showActions && (
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Дії</th>
              )}
            </tr>
          </thead>
          <AnimatedTableBody>
            {faculties.map((faculty) => (
              <AnimatedRow key={faculty.id} className="group/row transition-colors">
                <RowLinkCell href={`/faculties/${faculty.id}`}>{faculty.name}</RowLinkCell>
                <td className="px-4 py-3 text-muted-foreground">{deanName(faculty.dean)}</td>
                <td className="px-4 py-3 text-muted-foreground">{faculty._count.departments}</td>
                {showActions && (
                  <td className="relative z-10 px-4 py-3">
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
              </AnimatedRow>
            ))}
          </AnimatedTableBody>
        </DataTable>
      )}
    </div>
  );
}
