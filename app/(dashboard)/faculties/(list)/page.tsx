import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { listFaculties, parseFacultySort, type FacultySort } from '@/lib/queries/list-faculties';
import { parseSortDir } from '@/lib/queries/sort';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { SortHead, TableHead, TableRow } from '@/components/aurora/ui/table';
import { FacultyTable } from '@/components/faculty/faculty-table';
import { CreateFacultyDialog } from '@/components/faculty/create-faculty-dialog';
import { UK } from '@/lib/plural';

export default async function FacultiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { sort, dir } = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const sortField = parseFacultySort(sort);
  const sortDir = parseSortDir(dir);
  const faculties = await listFaculties({ sort: sortField, dir: sortDir });
  const isAdmin = role === 'ADMIN';

  let canCreate = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'FACULTY');
    canCreate = perms.canCreate;
    canDelete = perms.canDelete;
  }

  // `canUpdate` is not read here. Editing is reached from the record's own
  // header, not from a pencil on the row — see `faculty-table.tsx`.
  const departmentTotal = faculties.reduce((sum, f) => sum + f._count.departments, 0);

  // What «Додати факультет» needs, resolved here because the form is a
  // dialog on this page now rather than a `/faculties/new` route of its
  // own. Fetched only when the button will actually be drawn — see
  // `/staff`'s own version of this comment for why.
  const deanCandidates = canCreate
    ? await (async () => {
        const [takenDeanRows, takenHeadRows, allStaff] = await Promise.all([
          db.faculty.findMany({ select: { deanId: true }, where: { deanId: { not: null } } }),
          db.department.findMany({ select: { headId: true }, where: { headId: { not: null } } }),
          db.staff.findMany({
            where: ON_ROSTER,
            select: { id: true, lastName: true, firstName: true, patronymic: true },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          }),
        ]);
        const takenIds = new Set([
          ...takenDeanRows.map((r) => r.deanId as string),
          ...takenHeadRows.map((r) => r.headId as string),
        ]);
        return allStaff.filter((s) => !takenIds.has(s.id));
      })()
    : [];

  /**
   * The URL a column heading points at.
   *
   * Clicking the column already sorted flips its direction; clicking another
   * one starts it ascending, because «А→Я» is what somebody means by «sort by
   * декан» and having it arrive descending reads as a fault.
   *
   * Defaults are left OUT of the query string, so `/faculties` and
   * `/faculties?sort=name&dir=asc` are one URL rather than two that render the
   * same page.
   */
  function buildHref(col: FacultySort) {
    const nextDir = sortField === col && sortDir === 'asc' ? 'desc' : 'asc';
    const sp = new URLSearchParams();
    if (col !== 'name') sp.set('sort', col);
    if (nextDir !== 'asc') sp.set('dir', nextDir);
    const qs = sp.toString();
    return `/faculties${qs ? `?${qs}` : ''}`;
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
        label="Декан"
        href={buildHref('dean')}
        active={sortField === 'dean'}
        dir={sortDir}
      />
      <SortHead
        label="Кафедри"
        align="center"
        href={buildHref('departments')}
        active={sortField === 'departments'}
        dir={sortDir}
      />
      {canDelete && <TableHead align="center">Дії</TableHead>}
    </TableRow>
  );

  return (
    // Fills the dashboard's main area: the header card keeps its height and the
    // table takes what is left, scrolling its rows internally.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Факультети"
        subtitle={`${UK.record(faculties.length)} · ${UK.department(departmentTotal)}`}
        actions={canCreate && <CreateFacultyDialog staff={deanCandidates} />}
      />

      <FacultyTable faculties={faculties} head={head} canDelete={canDelete} fill />
    </div>
  );
}
