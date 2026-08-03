import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listStaff, STAFF_SORT_FIELDS, type StaffSortField } from '@/lib/queries/list-staff';
import { listDepartments } from '@/lib/queries/list-departments';
import { listFaculties } from '@/lib/queries/list-faculties';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SortTh } from '@/components/ui/sort-th';
import { StaffFilters } from '@/components/staff/staff-filters';
import { StaffTable } from '@/components/staff/staff-table';
import type { AcademicRank, Role, ScientificDegree } from '@/lib/generated/prisma/client';

const VALID_RANKS = new Set<string>(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']);
const VALID_DEGREES = new Set<string>(['CANDIDATE', 'DOCTOR']);

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

  const {
    roles,
    sort,
    dir,
    q,
    faculty,
    dept,
    rank,
    degree,
    partTime,
    degreeMatch,
    page,
    archived,
  } = params;

  // ?archived=1 is how an archived person is found again to be restored — they
  // are out of the ordinary list by design.
  const archivedView = archived === '1';

  // Role checkboxes (?roles=USER,EDITOR). Absent = НПП default; 'all' = no filter.
  const VALID_ROLES = new Set(['USER', 'EDITOR', 'ADMIN']);
  const rolesParam = typeof roles === 'string' ? roles : undefined;
  const roleFilter: Role[] | undefined = !rolesParam
    ? ['USER']
    : rolesParam === 'all'
      ? undefined
      : (() => {
          const picked = rolesParam.split(',').filter((r) => VALID_ROLES.has(r)) as Role[];
          return picked.length > 0 ? picked : undefined;
        })();
  const sortField: StaffSortField =
    typeof sort === 'string' && (STAFF_SORT_FIELDS as readonly string[]).includes(sort)
      ? (sort as StaffSortField)
      : 'lastName';
  const effectiveSortField: StaffSortField =
    sortField === 'employmentRate' && !isAdmin ? 'lastName' : sortField;
  const sortDir = dir === 'desc' ? 'desc' : 'asc';

  const rankFilter =
    typeof rank === 'string' && VALID_RANKS.has(rank) ? (rank as AcademicRank) : undefined;
  const degreeFilter =
    typeof degree === 'string' && VALID_DEGREES.has(degree)
      ? (degree as ScientificDegree)
      : undefined;

  const [staff, faculties, departments] = await Promise.all([
    listStaff({
      roles: roleFilter,
      includeAccount: isAdmin,
      sort: effectiveSortField,
      dir: sortDir,
      q: typeof q === 'string' ? q : undefined,
      facultyId: typeof faculty === 'string' ? faculty : undefined,
      departmentId: typeof dept === 'string' ? dept : undefined,
      rank: rankFilter,
      degree: degreeFilter,
      partTime: partTime === '1',
      degreeMatch: degreeMatch === '1',
      includeConfidential: isAdmin,
      archived: archivedView ? 'only' : 'exclude',
    }),
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

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      roles: rolesParam,
      sort: effectiveSortField !== 'lastName' ? effectiveSortField : undefined,
      dir: sortDir !== 'asc' ? sortDir : undefined,
      q: typeof q === 'string' ? q : undefined,
      faculty: typeof faculty === 'string' ? faculty : undefined,
      dept: typeof dept === 'string' ? dept : undefined,
      rank: rankFilter,
      degree: degreeFilter,
      partTime: partTime === '1' ? '1' : undefined,
      degreeMatch: degreeMatch === '1' ? '1' : undefined,
      archived: archivedView ? '1' : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/staff${qs ? `?${qs}` : ''}`;
  }

  const sortHeader = (
    <tr className="border-b bg-muted/40">
      <SortTh
        label="ПІБ"
        href={buildHref({
          sort: 'lastName',
          dir: effectiveSortField === 'lastName' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'lastName'}
        dir={sortDir}
      />
      <SortTh
        label="Email"
        href={buildHref({
          sort: 'email',
          dir: effectiveSortField === 'email' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'email'}
        dir={sortDir}
      />
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тип</th>
      <SortTh
        label="Кафедра / Відділ"
        href={buildHref({
          sort: 'department',
          dir: effectiveSortField === 'department' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'department'}
        dir={sortDir}
      />
      <SortTh
        label="Вчене звання"
        href={buildHref({
          sort: 'academicRank',
          dir: effectiveSortField === 'academicRank' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'academicRank'}
        dir={sortDir}
      />
      {isAdmin && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Роль</th>}
      {isAdmin && (
        <SortTh
          label="Ставка"
          href={buildHref({
            sort: 'employmentRate',
            dir: effectiveSortField === 'employmentRate' && sortDir === 'asc' ? 'desc' : 'asc',
          })}
          active={effectiveSortField === 'employmentRate'}
          dir={sortDir}
        />
      )}
    </tr>
  );

  // Key changes with every filter/sort combination so the table animates in fresh
  const tableKey = [
    rolesParam,
    effectiveSortField,
    sortDir,
    q,
    faculty,
    dept,
    rank,
    degree,
    partTime,
    degreeMatch,
    archivedView ? 'archived' : '',
    currentPage,
  ].join('|');

  return (
    // Fills the dashboard's main area: the header, filters and pager keep their
    // height and the table takes what is left, scrolling its rows internally.
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{archivedView ? 'Архів' : 'Персонал'}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {staff.length} записів
            {archivedView && ' — не враховуються в рейтингу поточного року'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Archived people are out of the ordinary list on purpose, so this is
              the only way back to them — and the only way to restore anyone. */}
          <Button asChild variant="outline">
            <Link
              href={
                archivedView ? buildHref({ archived: undefined }) : buildHref({ archived: '1' })
              }
            >
              {archivedView ? 'До списку' : 'Архів'}
            </Link>
          </Button>
          {canCreate && !archivedView && (
            <Button asChild>
              <Link href="/staff/new">Додати</Link>
            </Button>
          )}
        </div>
      </div>

      <StaffFilters
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />

      <StaffTable key={tableKey} staff={pageStaff} sortHeader={sortHeader} isAdmin={isAdmin} fill />

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        hrefFor={(p) => buildHref({ page: p > 1 ? String(p) : undefined })}
        summary={
          <>
            Стор. {currentPage} з {totalPages} · {staff.length} записів
          </>
        }
      />
    </div>
  );
}
