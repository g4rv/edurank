import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isNnvOversight } from '@/lib/science/oversight';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { listSciencePlans } from '@/lib/queries/list-science-plans';
import { listDepartments } from '@/lib/queries/list-departments';
import { listFaculties } from '@/lib/queries/list-faculties';
import { parsePlanListParams, planListHref, PLAN_PAGE_SIZE } from '@/lib/science/list-params';
import { isShort, matchesState, sortPlanRows } from '@/lib/science/plan-rows';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { Pagination } from '@/components/aurora/ui/pagination';
import { StatStrip, type Stat } from '@/components/dashboard/stat-strip';
import { DepartmentPlansTable } from '@/components/science/department-plans-table';
import { PlanFilters } from '@/components/science/plan-filters';

const CRUMBS = [{ label: 'Управління' }, { label: 'Наукова робота' }];
const BASE = '/science-plans';
const full = new Intl.NumberFormat('uk-UA');

/**
 * The ННВ's / ADMIN's read of EVERY кафедра's наукова робота plans — наказ
 * №152 п.3 puts oversight of наукова робота on ННВ, so this is their screen:
 * the university-wide sibling of `/my-department/science-plans`, which shows
 * one head's or декан's own кафедри via `scopeOf`.
 *
 * **Access is ADMIN, or an EDITOR whose division IS ННВ** — resolved by
 * `registryKey`, never by name (the name is editable on `/divisions`, and a
 * rename must not silently revoke this). This is deliberately its own check
 * rather than `canModerateRating` (`lib/rating/moderation.ts`): that flag can
 * be GRANTED to some other division for rating moderation, but наукова робота
 * oversight belongs to ННВ specifically by наказ, not to whoever a future
 * ADMIN hands the moderation flag to. Resolved by `isNnvOversight`
 * (`lib/science/oversight.ts`) — one helper shared with the dashboard nav,
 * `file-actions.ts`'s `fileUrl` and `/moderation`'s science section, rather
 * than each repeating the same `registryKey` lookup.
 *
 * **Read only** — records and their moderation are Stage 2.
 */
export default async function AllSciencePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const allowed = await isNnvOversight(session.user);
  if (!allowed) redirect('/profile');

  const template = await getActiveScienceTemplate();
  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  const [faculties, departments] = await Promise.all([listFaculties(), listDepartments()]);

  // A filter naming something that no longer exists is dropped rather than
  // obeyed — a bookmarked кафедра that has since been merged must not empty the
  // page with nothing on screen to say why.
  const asked = parsePlanListParams(raw);
  const params = {
    ...asked,
    facultyId: faculties.some((f) => f.id === asked.facultyId) ? asked.facultyId : undefined,
    departmentId: departments.some((d) => d.id === asked.departmentId)
      ? asked.departmentId
      : undefined,
  };

  // Rule 3, the exact bug fixed in the rating (audit-2026-08-27, finding #6):
  // a кафедра filter must never be ANDed against a PRIMARY-only факультет
  // condition, because that cancels out every сумісник whose other кафедра
  // sits in a different факультет. `listSciencePlans` takes a department id
  // WHITELIST rather than raw Prisma conditions, so a кафедра choice simply
  // WINS outright — it is never intersected with the факультет at all — and
  // resolving «every кафедра of this факультет» reads `Department.facultyId`,
  // a structural relation with no сумісництво ambiguity (сумісництво is a
  // STAFF↔кафедра fact, not a кафедра↔факультет one; see `onFaculty` in
  // `lib/queries/roster.ts`, whose OR this is exactly equivalent to once
  // `listSciencePlans`'s own `onDepartments` is applied to the result).
  const departmentIds = params.departmentId
    ? [params.departmentId]
    : params.facultyId
      ? departments.filter((d) => d.facultyId === params.facultyId).map((d) => d.id)
      : departments.map((d) => d.id);

  // The SCOPE — кафедра and пошук applied, стан not. The four tiles below are
  // the four states of this set, so they have to be counted before one of them
  // narrows it; counted after, every tile but the chosen one would read zero
  // and there would be no way back out of the filter.
  const scope = await listSciencePlans({ templateId: template.id, departmentIds, q: params.q });

  const rows = sortPlanRows(
    scope.filter((row) => matchesState(row, params.state)),
    params.sort,
    params.dir
  );

  // Paging is applied after the filter so the header count and the pager both
  // describe the whole filtered set, not the fifty rows on screen.
  const totalPages = Math.max(1, Math.ceil(rows.length / PLAN_PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const pageRows = rows.slice((page - 1) * PLAN_PAGE_SIZE, page * PLAN_PAGE_SIZE);

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
      // Deliberately not styled as a warning (rule 4, owner 2026-09-15): on the
      // real database this is 321 of 348 — most розподіли happen later in the
      // year than plans do, and that is the ordinary shape of the data, not a
      // problem to flag.
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
    // Fills the dashboard's main area: the crumb, the header, the filters, the
    // strip and the pager keep their height and the table takes what is left,
    // scrolling its rows internally. Before this the page scrolled AND the
    // table did, because the table's default height cap is an estimate of the
    // furniture above it and this screen carries more than the estimate allows.
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <p className="mt-0.5 text-sm text-foreground-soft">
          {template.academicYear} навчальний рік · {full.format(rows.length)} позицій
        </p>
      </div>

      <PlanFilters
        basePath={BASE}
        params={params}
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />

      <StatStrip stats={stats} className="sm:grid-cols-5" />

      {rows.length === 0 ? (
        <EmptyState>Немає позицій за цими фільтрами.</EmptyState>
      ) : (
        <DepartmentPlansTable
          rows={pageRows}
          showDepartment
          params={params}
          basePath={BASE}
          // Only here. `isNnvOversight` already gated the whole page, and
          // `/my-department/science-plans` — the завідувач's and декан's read
          // of the same table — deliberately gets no actions at all.
          canUnlock
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
