import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { Button } from '@/components/ui/button';
import { SortTh } from '@/components/ui/sort-th';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DataTable } from '@/components/ui/data-table';
import { DeleteDepartmentButton } from '@/components/department/delete-button';

function headName(head: { lastName: string; firstName: string; patronymic: string } | null) {
  if (!head) return '—';
  return `${head.lastName} ${head.firstName} ${head.patronymic}`;
}

const VALID_SORTS = ['name', 'faculty'] as const;
type SortField = (typeof VALID_SORTS)[number];

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { sort, dir } = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const sortField =
    typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort)
      ? (sort as SortField)
      : 'name';
  const sortDir = dir === 'desc' ? ('desc' as const) : ('asc' as const);

  const departments = await db.department.findMany({
    select: {
      id: true,
      name: true,
      faculty: { select: { name: true } },
      head: { select: { lastName: true, firstName: true, patronymic: true } },
      _count: { select: { primaryStaff: true } },
    },
    orderBy:
      sortField === 'faculty'
        ? [{ faculty: { name: sortDir } }, { name: sortDir }]
        : [{ name: sortDir }],
  });

  const isAdmin = role === 'ADMIN';
  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'DEPARTMENT');
    canCreate = perms.canCreate;
    canEdit = perms.canUpdate;
    canDelete = perms.canDelete;
  }

  const showActions = canEdit || canDelete;

  function buildHref(col: SortField) {
    const nextDir = sortField === col && sortDir === 'asc' ? 'desc' : 'asc';
    const sp = new URLSearchParams({ sort: col, dir: nextDir });
    return `/departments?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Кафедри</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{departments.length} записів</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/departments/new">Додати</Link>
          </Button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Кафедр не знайдено
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr className="border-b bg-muted/40">
              <SortTh
                label="Назва"
                href={buildHref('name')}
                active={sortField === 'name'}
                dir={sortDir}
              />
              <SortTh
                label="Факультет"
                href={buildHref('faculty')}
                active={sortField === 'faculty'}
                dir={sortDir}
              />
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Завідувач</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">НПП</th>
              {showActions && (
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Дії</th>
              )}
            </tr>
          </thead>
          <AnimatedTableBody>
            {departments.map((dept) => (
              <AnimatedRow key={dept.id} className="relative transition-colors">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/departments/${dept.id}`} className="absolute inset-0" />
                  {dept.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{dept.faculty.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{headName(dept.head)}</td>
                <td className="px-4 py-3 text-muted-foreground">{dept._count.primaryStaff}</td>
                {showActions && (
                  <td className="relative z-10 px-4 py-3">
                    <div className="flex items-start justify-end gap-2">
                      {canEdit && (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/departments/${dept.id}/edit`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                      )}
                      {canDelete && (
                        <DeleteDepartmentButton departmentId={dept.id} departmentName={dept.name} />
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
