import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { scopeOf } from '@/lib/queries/scope';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { listSciencePlans } from '@/lib/queries/list-science-plans';
import { listDepartments } from '@/lib/queries/list-departments';
import { parsePlanListParams, planListHref, PLAN_PAGE_SIZE } from '@/lib/science/list-params';
import { isShort, matchesState, sortPlanRows } from '@/lib/science/plan-rows';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { Pagination } from '@/components/aurora/ui/pagination';
import { StatStrip, type Stat } from '@/components/dashboard/stat-strip';
import { DepartmentPlansTable } from '@/components/science/department-plans-table';
import { PlanFilters } from '@/components/science/plan-filters';

const CRUMBS = [{ label: 'Управління' }, { label: 'Плани кафедри' }];
const BASE = '/my-department/science-plans';
const full = new Intl.NumberFormat('uk-UA');

/**
 * A завідувача's read of who on their кафедра has planned their наукова
 * робота — the same screen for a декан, over every кафедра of their
 * факультет. `scopeOf` decides who gets in at all; ADMIN is not this screen's
 * audience and gets the university-wide `/science-plans`.
 *
 * **Read only.** This project keeps «may I look» (`scopeOf`) apart from «may I
 * decide» (`headOf`) on purpose, and this page is only the first — there is no
 * edit control here for anybody, head or декан (owner, 2026-09-15).
 *
 * It wears `/science-plans`'s furniture — the same filters, tiles, sortable
 * headings and pager — minus the факультет picker, which a завідувач has
 * nothing to choose between. A декан with eight кафедри needs the rest of it as
 * much as ННВ does.
 */
export default async function DepartmentSciencePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const scopeIds = await scopeOf(session.user.staffId);
  // Oversees nothing = no business here, the same redirect /my-department
  // itself uses for the same reason.
  if (scopeIds.length === 0) redirect('/profile');

  const template = await getActiveScienceTemplate();

  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Плани кафедри</h1>
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  // Names for the кафедра picker, and the guard that keeps `?dept=` inside what
  // this person oversees: a декан's own list, never every кафедра in the
  // university. A `?dept=` naming somebody else's кафедра is dropped, not
  // obeyed — the filter must not widen the scope the page was let into.
  const all = await listDepartments();
  const scoped = all.filter((d) => scopeIds.includes(d.id));

  const asked = parsePlanListParams(raw);
  const params = {
    ...asked,
    facultyId: undefined,
    departmentId: scoped.some((d) => d.id === asked.departmentId) ? asked.departmentId : undefined,
  };

  const departmentIds = params.departmentId ? [params.departmentId] : scopeIds;
  const scope = await listSciencePlans({ templateId: template.id, departmentIds, q: params.q });

  const rows = sortPlanRows(
    scope.filter((row) => matchesState(row, params.state)),
    params.sort,
    params.dir
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / PLAN_PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const pageRows = rows.slice((page - 1) * PLAN_PAGE_SIZE, page * PLAN_PAGE_SIZE);

  // Only worth a column when the rows can come from more than one кафедра — a
  // завідувач with their own single кафедра does not need it repeated on every
  // row (rule 6). Read off the SCOPE rather than the filter, so the table does
  // not lose and regain a column as a декан narrows to one кафедра.
  const showDepartment = scopeIds.length > 1;

  const stats: Stat[] = [
    {
      label: 'Усього позицій',
      value: full.format(scope.length),
      href: planListHref(BASE, params, { state: undefined }),
      active: params.state === undefined,
    },
    {
      label: 'Мають план',
      value: full.format(scope.filter((r) => r.hasPlan).length),
      href: planListHref(BASE, params, { state: 'plan' }),
      active: params.state === 'plan',
    },
    {
      label: 'Під ціллю',
      value: full.format(scope.filter(isShort).length),
      href: planListHref(BASE, params, { state: 'short' }),
      active: params.state === 'short',
    },
    {
      label: 'Без ставки',
      value: full.format(scope.filter((r) => r.rateHundredths === null).length),
      href: planListHref(BASE, params, { state: 'norate' }),
      active: params.state === 'norate',
    },
    {
      label: 'Нічого не виконано',
      value: full.format(scope.filter((r) => r.doneHundredths === 0).length),
      href: planListHref(BASE, params, { state: 'nodone' }),
      active: params.state === 'nodone',
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Плани кафедри</h1>
        <p className="mt-0.5 text-sm text-foreground-soft">
          {template.academicYear} навчальний рік · {full.format(rows.length)} позицій
        </p>
      </div>

      <PlanFilters
        basePath={BASE}
        params={params}
        departments={scoped.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />

      <StatStrip stats={stats} className="sm:grid-cols-5" />

      {rows.length === 0 ? (
        <EmptyState>
          {scope.length === 0
            ? showDepartment
              ? 'На жодній із кафедр немає НПП.'
              : 'На кафедрі немає НПП.'
            : 'Немає позицій за цими фільтрами.'}
        </EmptyState>
      ) : (
        <DepartmentPlansTable
          rows={pageRows}
          showDepartment={showDepartment}
          params={params}
          basePath={BASE}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(p) => planListHref(BASE, params, { page: p > 1 ? String(p) : undefined })}
        summary={
          <>
            Стор. {page} з {totalPages} · {full.format(rows.length)} позицій
          </>
        }
      />
    </div>
  );
}
