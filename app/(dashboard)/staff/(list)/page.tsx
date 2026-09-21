import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listStaff } from '@/lib/queries/list-staff';
import { parseStaffListParams, toStaffFilters } from '@/lib/staff/list-params';
import { listDepartments } from '@/lib/queries/list-departments';
import { listFaculties } from '@/lib/queries/list-faculties';
import { listDivisions } from '@/lib/queries/list-divisions';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { editorHasFieldGrant } from '@/lib/permissions';
import { Button } from '@/components/aurora/ui/button';
import { DownloadButton } from '@/components/ui/download-button';
import { Pagination } from '@/components/aurora/ui/pagination';
import { SortHead, TableHead, TableRow } from '@/components/aurora/ui/table';
import { CreateStaffDialog } from '@/components/staff/create-staff-dialog';
import { StaffFilters } from '@/components/staff/staff-filters';
import { StaffListHeader } from '@/components/staff/staff-list-header';
import { StaffTable } from '@/components/staff/staff-table';

// The list is a few hundred people; sending them all is cheap, rendering them
// all is not — 200 rows made the page ~14 000px tall.
const PAGE_SIZE = 50;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';

  // Parsed by the shared reader, which `/api/export/staff` uses too — so the
  // spreadsheet the button below produces is the list on this screen, and stays
  // that way when a filter is added.
  const filters = parseStaffListParams(params, { isAdmin });
  const {
    type: typeParam,
    sort: effectiveSortField,
    dir: sortDir,
    archivedView,
    rank: rankFilter,
    degree: degreeFilter,
  } = filters;
  const { page } = params;

  const [staff, faculties, departments] = await Promise.all([
    listStaff(toStaffFilters(filters, { isAdmin })),
    listFaculties(),
    listDepartments(),
  ]);

  // Paging is applied after the query so the header count and the pager both
  // describe the whole filtered set, not the slice on screen.
  const totalPages = Math.max(1, Math.ceil(staff.length / PAGE_SIZE));
  const requestedPage = typeof page === 'string' ? Number(page) : 1;
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(Math.trunc(requestedPage), 1), totalPages)
    : 1;
  const pageStaff = staff.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  let canCreate = isAdmin;
  if (!canCreate && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'STAFF');
    canCreate = perms.canCreate;
  }

  // What «Додати користувача» needs, and it is resolved HERE because the form
  // is a dialog on this page now rather than a `/staff/new` route of its own.
  //
  // Fetched only when the button will actually be drawn: a prop reaches the
  // page payload whether or not the component using it renders, so asking for
  // divisions on every visit would send their names to every editor who cannot
  // create anybody. Same rule the deleted page followed, kept.
  const showCreate = canCreate && !archivedView;
  const [divisions, canEditPartTime] = showCreate
    ? await Promise.all([
        // ADMIN only: a person's відділ decides which permissions their EDITOR
        // role would carry, so the server takes it from nobody else.
        isAdmin ? listDivisions() : Promise.resolve([]),
        // The same grant `updateStaff` checks, so «Додаткова кафедра» is offered
        // only to somebody whose save would keep it.
        isAdmin
          ? Promise.resolve(true)
          : editorHasFieldGrant(session.user.staffId, 'partTimeDepartmentIds'),
      ])
    : [[], false];

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      type: typeParam !== 'npp' ? typeParam : undefined,
      sort: effectiveSortField !== 'lastName' ? effectiveSortField : undefined,
      dir: sortDir !== 'asc' ? sortDir : undefined,
      q: filters.q,
      faculty: filters.facultyId,
      dept: filters.departmentId,
      rank: rankFilter,
      degree: degreeFilter,
      partTime: filters.partTime ? '1' : undefined,
      degreeMatch: filters.degreeMatch ? '1' : undefined,
      activated: filters.activated === undefined ? undefined : filters.activated ? '1' : '0',
      archived: archivedView ? '1' : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/staff${qs ? `?${qs}` : ''}`;
  }

  // The same query string the page is on, pointed at the export route. Built
  // off `buildHref` so a filter can never be in one and missing from the other;
  // `page` is deliberately absent — the file is the whole filtered set, not the
  // fifty rows on screen.
  const exportHref = `/api/export/staff${buildHref({}).slice('/staff'.length)}`;

  // The «Тип» column is gone (owner, 2026-09-21): it printed the same three
  // letters down every row of the default view, and the fact is an attribute of
  // the person, so it is a badge on their name now.
  const sortHeader = (
    <TableRow>
      <SortHead
        label="ПІБ"
        href={buildHref({
          sort: 'lastName',
          dir: effectiveSortField === 'lastName' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'lastName'}
        dir={sortDir}
      />
      <SortHead
        label="Email"
        href={buildHref({
          sort: 'email',
          dir: effectiveSortField === 'email' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'email'}
        dir={sortDir}
      />
      <SortHead
        label="Кафедра / Відділ"
        href={buildHref({
          sort: 'department',
          dir: effectiveSortField === 'department' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'department'}
        dir={sortDir}
      />
      <SortHead
        label="Вчене звання"
        href={buildHref({
          sort: 'academicRank',
          dir: effectiveSortField === 'academicRank' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'academicRank'}
        dir={sortDir}
      />
      {isAdmin && <TableHead align="center">Роль</TableHead>}
      {isAdmin && (
        <SortHead
          label="Ставка"
          align="center"
          href={buildHref({
            sort: 'employmentRate',
            dir: effectiveSortField === 'employmentRate' && sortDir === 'asc' ? 'desc' : 'asc',
          })}
          active={effectiveSortField === 'employmentRate'}
          dir={sortDir}
        />
      )}
    </TableRow>
  );

  // Key changes with every filter/sort combination so the table animates in fresh
  const tableKey = [
    typeParam,
    effectiveSortField,
    sortDir,
    filters.q,
    filters.facultyId,
    filters.departmentId,
    rankFilter,
    degreeFilter,
    filters.partTime,
    filters.degreeMatch,
    // Was missing, so switching «Активовані» ↔ «Не активовані» re-rendered the
    // same key and the table did not animate the new set in.
    filters.activated,
    archivedView ? 'archived' : '',
    currentPage,
  ].join('|');

  // The pager lives in the table card's own footer strip, pinned under the
  // rows (owner, 2026-09-21). Loose below the card it was the one piece of
  // furniture the card's height budget did not account for, so on a short
  // viewport the page scrolled to reach it — past a table that was already
  // scrolling its own rows.
  //
  // Only when there IS more than one page: `Pagination` renders nothing at one,
  // and an empty strip under the rows reads as a table that failed to finish.
  // The count it would have carried is in the header card above either way.
  const pager = totalPages > 1 && (
    <tr>
      <td colSpan={isAdmin ? 6 : 4} className="px-4 py-2">
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          align="center"
          hrefFor={(p) => buildHref({ page: p > 1 ? String(p) : undefined })}
          summary={
            <>
              Стор. {currentPage} з {totalPages}
            </>
          }
        />
      </td>
    </tr>
  );

  return (
    // Fills the dashboard's main area: the header card keeps its height and the
    // table takes what is left, scrolling its rows internally.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <StaffListHeader
        title={archivedView ? 'Архів' : 'Персонал'}
        subtitle={
          <>
            {staff.length} записів
            {archivedView && ' — не враховуються в рейтингу поточного року'}
          </>
        }
        actions={
          <>
            {/* Archived people are out of the ordinary list on purpose, so this
                is the only way back to them — and the only way to restore
                anyone. */}
            <Button asChild variant="outline">
              <Link
                href={
                  archivedView ? buildHref({ archived: undefined }) : buildHref({ archived: '1' })
                }
              >
                {archivedView ? 'До списку' : 'Архів'}
              </Link>
            </Button>
            {/* ADMIN only, matching the route. The href is this page's own query
                string, so the file is whatever is on screen right now —
                including the sort. The shared button, so this export reports its
                progress the same way every other one does. */}
            {isAdmin && (
              <DownloadButton
                href={exportHref}
                label="Експорт"
                title="Список персоналу за поточними фільтрами"
              />
            )}
            {showCreate && (
              <CreateStaffDialog
                departments={departments}
                divisions={divisions}
                isAdmin={isAdmin}
                canEditPartTime={canEditPartTime}
              />
            )}
          </>
        }
        filters={
          <StaffFilters
            faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
            departments={departments.map((d) => ({
              id: d.id,
              name: d.name,
              facultyId: d.facultyId,
            }))}
            showActivation={isAdmin}
          />
        }
      />

      <StaffTable
        key={tableKey}
        staff={pageStaff}
        head={sortHeader}
        isAdmin={isAdmin}
        footer={pager || undefined}
        fill
      />
    </div>
  );
}
