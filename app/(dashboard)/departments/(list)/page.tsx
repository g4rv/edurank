import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import {
  listDepartmentsByFaculty,
  parseDepartmentSort,
  type DepartmentSort,
} from '@/lib/queries/list-departments';
import { parseSortDir } from '@/lib/queries/sort';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { Button } from '@/components/aurora/ui/button';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { SortHead, TableHead, TableRow } from '@/components/aurora/ui/table';
import { DepartmentTable } from '@/components/department/department-table';
import { UK } from '@/lib/plural';

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

  const sortField = parseDepartmentSort(sort);
  const sortDir = parseSortDir(dir);
  const groups = await listDepartmentsByFaculty({ sort: sortField, dir: sortDir });

  const isAdmin = role === 'ADMIN';
  let canCreate = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'DEPARTMENT');
    canCreate = perms.canCreate;
    canDelete = perms.canDelete;
  }

  // `canUpdate` is not read here. Editing is reached from the record's own
  // header, not from a pencil on the row — see `department-table.tsx`.

  // The subtitle counts the whole list, not the groups: «54 записи» is what the
  // page holds, and the кафедри per факультет are on each heading.
  const departmentTotal = groups.reduce((sum, g) => sum + g.count, 0);
  const staffTotal = groups.reduce((sum, g) => sum + g.staffTotal, 0);

  /**
   * See `/faculties` — same rule: flip the active column, start any other one
   * ascending, and leave the defaults out of the query string.
   *
   * There is no «Факультет» link here. The list is grouped under факультет
   * headings, so ordering by факультет is what the page already does; these
   * three order the кафедри inside each group.
   */
  function buildHref(col: DepartmentSort) {
    const nextDir = sortField === col && sortDir === 'asc' ? 'desc' : 'asc';
    const sp = new URLSearchParams();
    if (col !== 'name') sp.set('sort', col);
    if (nextDir !== 'asc') sp.set('dir', nextDir);
    const qs = sp.toString();
    return `/departments${qs ? `?${qs}` : ''}`;
  }

  const head = (
    <TableRow>
      <SortHead
        label="Назва"
        href={buildHref('name')}
        active={sortField === 'name'}
        dir={sortDir}
      />
      <SortHead
        label="Завідувач"
        href={buildHref('head')}
        active={sortField === 'head'}
        dir={sortDir}
      />
      <SortHead
        label="НПП"
        align="center"
        href={buildHref('staff')}
        active={sortField === 'staff'}
        dir={sortDir}
      />
      {canDelete && <TableHead align="center">Дії</TableHead>}
    </TableRow>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Кафедри"
        subtitle={`${UK.record(departmentTotal)} · ${UK.person(staffTotal)}`}
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/departments/new">
                <Plus />
                Додати кафедру
              </Link>
            </Button>
          )
        }
      />

      <DepartmentTable groups={groups} head={head} canDelete={canDelete} fill />
    </div>
  );
}
