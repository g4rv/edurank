import {
  PLAN_SORT_FIELDS,
  PLAN_STATES,
  type PlanSortField,
  type PlanState,
} from '@/lib/science/plan-rows';

/**
 * The query string both plan lists read — `/science-plans` (ННВ, every
 * кафедра) and `/my-department/science-plans` (a завідувач's or декан's own).
 *
 * One parser and one href builder for the two, for the reason
 * `lib/staff/list-params.ts` gives: parsed in two places they drift on the
 * first filter anybody adds, and the drift is silent — a plausible-looking
 * list with the wrong people in it.
 */

/** How many rows one page of the table shows. The university has 348 positions
 *  and every one of them was in the DOM before this; `/staff` caps at the same
 *  fifty, and its own comment records that 200 rows made the page ~14 000px
 *  tall. */
export const PLAN_PAGE_SIZE = 50;

export type PlanParamSource = Record<string, string | string[] | undefined> | URLSearchParams;

export interface PlanListParams {
  q: string | undefined;
  facultyId: string | undefined;
  departmentId: string | undefined;
  state: PlanState | undefined;
  /** Absent = the default order: short of target first, then by name. */
  sort: PlanSortField | undefined;
  dir: 'asc' | 'desc';
  page: number;
}

function read(source: PlanParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function parsePlanListParams(source: PlanParamSource): PlanListParams {
  const rawSort = read(source, 'sort');
  const sort = (PLAN_SORT_FIELDS as readonly string[]).includes(rawSort ?? '')
    ? (rawSort as PlanSortField)
    : undefined;

  const rawState = read(source, 'state');
  const state = (PLAN_STATES as readonly string[]).includes(rawState ?? '')
    ? (rawState as PlanState)
    : undefined;

  const rawPage = Number(read(source, 'page'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1;

  return {
    q: read(source, 'q')?.trim() || undefined,
    facultyId: read(source, 'faculty'),
    departmentId: read(source, 'dept'),
    state,
    sort,
    dir: read(source, 'dir') === 'asc' ? 'asc' : 'desc',
    page,
  };
}

type Overrides = Partial<
  Record<'q' | 'faculty' | 'dept' | 'state' | 'sort' | 'dir' | 'page', string | undefined>
>;

/**
 * This page's URL with some of it changed.
 *
 * **Anything but `page` resets to page one.** Page 5 of the old result set is
 * meaningless once a filter narrows it — the trap `StaffFilters` handles in its
 * own builder, and one the stat tiles and the sortable headings would each have
 * walked into separately.
 */
export function planListHref(
  basePath: string,
  params: PlanListParams,
  overrides: Overrides = {}
): string {
  const base: Overrides = {
    q: params.q,
    faculty: params.facultyId,
    dept: params.departmentId,
    state: params.state,
    sort: params.sort,
    // Only meaningful beside a sorted column, and `desc` is what an absent one
    // means — so the default view carries neither, the same «no param» rule
    // every other list in the app follows.
    dir: params.sort && params.dir === 'asc' ? 'asc' : undefined,
    page: params.page > 1 ? String(params.page) : undefined,
  };

  const touchesFilters = Object.keys(overrides).some((key) => key !== 'page');
  const merged: Overrides = { ...base, ...overrides };
  if (touchesFilters && overrides.page === undefined) merged.page = undefined;

  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
