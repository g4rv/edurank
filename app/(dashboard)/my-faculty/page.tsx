import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyDepartments } from '@/lib/queries/list-my-department';
import { listStaff } from '@/lib/queries/list-staff';
import { deanOf } from '@/lib/queries/scope';
import { parseStaffListParams, toStaffFilters } from '@/lib/staff/list-params';
import { EmptyState } from '@/components/aurora/ui/card';
import { LinkTabs } from '@/components/aurora/ui/link-tabs';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { Pagination } from '@/components/aurora/ui/pagination';
import {
  SortHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/aurora/ui/table';
import { DownloadButton } from '@/components/ui/download-button';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { StaffFilters } from '@/components/staff/staff-filters';
import { StaffTable } from '@/components/staff/staff-table';
import { ToolbarRow } from '@/components/staff/record-toolbar';

const PAGE_SIZE = 50;

/**
 * «Мій факультет» — a декан's own screen (owner, 2026-09-24).
 *
 * Two tabs, both READ-ONLY: a декан inspects everything a завідувач may and
 * changes nothing (`scopeOf` reads, `headOf` decides — a декан is never a
 * head, `headDeanConflict`).
 *
 * - **Кафедри** — one row per кафедра: its head, its people and their rating.
 *   The кафедра opens as its head sees it and the head opens their record,
 *   both read-only. Розподіл ставок is not
 *   a декан's (owner, 2026-09-24), so neither the fund nor the grid is here.
 * - **Персонал** — `/staff`'s list, search and filters, fixed to this факультет
 *   and to НПП: the system is run by administrative staff but tracks НПП, and
 *   a декан's view has no administrative people in it.
 */
export default async function MyFacultyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const faculties = await deanOf(session.user.staffId);
  // Not an error page: somebody who is no декан has no business here.
  if (faculties.length === 0) redirect('/profile');
  const faculty = faculties.find((f) => f.id === params.faculty) ?? faculties[0];

  const template = await getActiveTemplate();
  const tab = params.tab === 'staff' ? 'staff' : 'departments';
  const base = `/my-faculty${faculties.length > 1 ? `?faculty=${faculty.id}&` : '?'}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Мій факультет"
        subtitle={
          <>
            {faculty.name}
            {template && ` · рейтинг за ${template.year} рік`}
          </>
        }
        actions={
          template ? (
            <DownloadButton
              href={`/api/export/department-ratings?faculty=${faculty.id}`}
              label={`Рейтинг факультету ${template.year}`}
              title={`ПІБ, кафедра і рейтинг за ${template.year} рік усіх НПП факультету`}
            />
          ) : undefined
        }
      />

      <ToolbarRow>
        <LinkTabs
          tabs={[
            {
              href: `${base}tab=departments`.replace('?tab=departments', ''),
              label: 'Кафедри',
              active: tab === 'departments',
            },
            { href: `${base}tab=staff`, label: 'Персонал', active: tab === 'staff' },
          ]}
        />
      </ToolbarRow>

      {tab === 'departments' ? (
        <DepartmentsTab
          facultyId={faculty.id}
          staffId={session.user.staffId}
          year={template?.year ?? null}
        />
      ) : (
        <StaffTab facultyId={faculty.id} params={params} base={base} />
      )}
    </div>
  );
}

/**
 * Кафедра | Завідувач | НПП | Рейтинг <рік> (owner, 2026-09-24). Widths add up
 * (§12): 18 + 6 + 10 = 34rem declared plus an 18rem floor for the кафедра.
 */
const DEPARTMENT_COLUMNS = [null, '18rem', '6rem', '10rem'] as const;

async function DepartmentsTab({
  facultyId,
  staffId,
  year,
}: {
  facultyId: string;
  staffId: string | null | undefined;
  year: number | null;
}) {
  if (year === null) return <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>;

  // `listMyDepartments` — the same people and totals the кафедра page shows,
  // сумісники included, so the two screens cannot disagree.
  const [mine, heads] = await Promise.all([
    listMyDepartments(staffId, year),
    db.department.findMany({
      where: { facultyId },
      select: {
        id: true,
        head: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
      },
    }),
  ]);
  const headOfDepartment = new Map(heads.map((d) => [d.id, d.head]));
  const departments = mine.filter((d) => headOfDepartment.has(d.id));

  if (departments.length === 0) return <EmptyState>На факультеті немає кафедр</EmptyState>;

  return (
    <Table
      columns={DEPARTMENT_COLUMNS}
      minWidth="calc(18rem + 18rem + 6rem + 10rem)"
      fill
      head={
        <TableRow>
          <TableHead>Кафедра</TableHead>
          <TableHead>Завідувач</TableHead>
          <TableHead align="center">НПП</TableHead>
          {/* The SUM of the кафедра's НПП, the owner's call. The university's
              own «Рейтинг кафедр» chart plots the average instead. */}
          <TableHead align="center" className="whitespace-nowrap">
            Рейтинг {year}
          </TableHead>
        </TableRow>
      }
    >
      <TableBody>
        {departments.map((d) => {
          const head = headOfDepartment.get(d.id);
          const total = d.staff.reduce((sum, person) => sum + person.total, 0);
          return (
            <TableRow key={d.id} className="[&>td]:align-middle" hoverable>
              {/* That кафедра exactly as its head sees it — read-only. */}
              <RowLinkCell href={`/my-department?department=${d.id}`}>{d.name}</RowLinkCell>
              {head ? (
                // The head's own record, read-only — a декан may read every
                // record on their факультет.
                <RowLinkCell href={`/staff/${head.id}`}>
                  {`${head.lastName} ${head.firstName} ${head.patronymic}`}
                </RowLinkCell>
              ) : (
                <TableCell>—</TableCell>
              )}
              <TableCell numeric align="center">
                {d.staff.length}
              </TableCell>
              <TableCell numeric align="center" className="font-semibold">
                {Math.round(total * 100) / 100}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

async function StaffTab({
  facultyId,
  params,
  base,
}: {
  facultyId: string;
  params: { [key: string]: string | string[] | undefined };
  base: string;
}) {
  // `/staff`'s own parsing, then two things fixed that the URL cannot change:
  // this факультет, and НПП only. A декан sees no confidential column and no
  // account state — the same as an EDITOR on `/staff`.
  const filters = parseStaffListParams(params, { isAdmin: false });
  const [staff, departments] = await Promise.all([
    listStaff({
      ...toStaffFilters(filters, { isAdmin: false }),
      facultyId,
      isNpp: true,
      archived: 'exclude',
    }),
    db.department.findMany({
      where: { facultyId },
      select: { id: true, name: true, facultyId: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(staff.length / PAGE_SIZE));
  const requested = typeof params.page === 'string' ? Number(params.page) : 1;
  const currentPage = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), totalPages)
    : 1;
  const pageStaff = staff.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      sort: filters.sort !== 'lastName' ? filters.sort : undefined,
      dir: filters.dir !== 'asc' ? filters.dir : undefined,
      q: filters.q,
      dept: filters.departmentId,
      rank: filters.rank,
      degree: filters.degree,
      partTime: filters.partTime ? '1' : undefined,
      degreeMatch: filters.degreeMatch ? '1' : undefined,
    };
    for (const [k, v] of Object.entries({ ...current, ...overrides })) if (v) sp.set(k, v);
    return `${base}tab=staff${sp.size ? `&${sp.toString()}` : ''}`;
  }

  function sortHref(field: string) {
    return href({
      sort: field,
      dir: filters.sort === field && filters.dir === 'asc' ? 'desc' : 'asc',
    });
  }

  const head = (
    <TableRow>
      <SortHead
        label="ПІБ"
        href={sortHref('lastName')}
        active={filters.sort === 'lastName'}
        dir={filters.dir}
      />
      <SortHead
        label="Email"
        href={sortHref('email')}
        active={filters.sort === 'email'}
        dir={filters.dir}
      />
      <SortHead
        label="Кафедра"
        href={sortHref('department')}
        active={filters.sort === 'department'}
        dir={filters.dir}
      />
      <SortHead
        label="Вчене звання"
        href={sortHref('academicRank')}
        active={filters.sort === 'academicRank'}
        dir={filters.dir}
      />
    </TableRow>
  );

  const pager = totalPages > 1 && (
    <tr>
      <td colSpan={4} className="px-4 py-2">
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          align="center"
          hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })}
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
    <>
      {/* The filter band in a card of its own, the way `/staff` carries it in
          its header — here the header belongs to the whole page. */}
      <div className="shrink-0 rounded-xl border bg-card px-5 py-3 shadow-card">
        <StaffFilters
          faculties={[]}
          departments={departments}
          showType={false}
          showFaculty={false}
          count={`${staff.length} НПП`}
        />
      </div>
      <StaffTable staff={pageStaff} head={head} isAdmin={false} footer={pager || undefined} fill />
    </>
  );
}
