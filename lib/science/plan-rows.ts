import type { SciencePlanRowSummary } from '@/lib/queries/list-science-plans';

/**
 * What the plan lists filter and sort by, apart from the database.
 *
 * `listSciencePlans` reads people and their rows; the three facts these
 * functions work on — has a plan, is short, has no ставка — are all COMPUTED
 * after that read, out of a target that itself depends on a live розподіл. So
 * they cannot be a `where` clause, and putting them in the page would mean two
 * copies the moment the завідувач's screen wanted the same filter.
 */

export const PLAN_STATES = ['plan', 'short', 'norate'] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export const PLAN_STATE_LABELS: Record<PlanState, string> = {
  plan: 'Мають план',
  short: 'Під ціллю',
  norate: 'Без ставки',
};

/**
 * A person is short of their target only when they HAVE one — a null target
 * (no розподіл yet, D8) is not «short», it is «nothing to compare against».
 * `shortfallHundredths` is already `null` for exactly that case (`planTarget`
 * in `lib/science/target.ts`), so this is the one field the test needs.
 */
export function isShort(row: SciencePlanRowSummary): boolean {
  return row.shortfallHundredths !== null && row.shortfallHundredths > 0;
}

export function matchesState(row: SciencePlanRowSummary, state: PlanState | undefined): boolean {
  switch (state) {
    case 'plan':
      return row.hasPlan;
    case 'short':
      return isShort(row);
    case 'norate':
      return row.rateHundredths === null;
    default:
      return true;
  }
}

export const PLAN_SORT_FIELDS = [
  'name',
  'department',
  'rate',
  'target',
  'planned',
  'shortfall',
] as const;
export type PlanSortField = (typeof PLAN_SORT_FIELDS)[number];

/** Right-aligned columns of figures, which read best largest-first on the
 *  first click — the same rule `/rating` applies to its score columns. */
const NUMERIC_FIELDS: ReadonlySet<PlanSortField> = new Set([
  'rate',
  'target',
  'planned',
  'shortfall',
]);

/** Where a click on this column's heading goes: flip the direction when it is
 *  already the sorted one, otherwise start in that column's natural order. */
export function nextDir(
  sort: PlanSortField | undefined,
  dir: 'asc' | 'desc',
  column: PlanSortField
): 'asc' | 'desc' {
  if (sort === column) return dir === 'asc' ? 'desc' : 'asc';
  return NUMERIC_FIELDS.has(column) ? 'desc' : 'asc';
}

function figure(row: SciencePlanRowSummary, sort: PlanSortField): number | null {
  switch (sort) {
    case 'rate':
      return row.rateHundredths;
    case 'target':
      return row.targetHundredths;
    case 'planned':
      return row.plannedHundredths;
    case 'shortfall':
      return row.shortfallHundredths;
    default:
      return null;
  }
}

/**
 * The DEFAULT order is not a column sort: short-of-target first, then
 * alphabetically. The page exists to find who has not planned, not to read the
 * roster in roster order — so that stays what an untouched table shows, and a
 * column sort is something somebody asks for.
 *
 * A `Staff` name has no locale-independent order (ї, і, є sort differently
 * under the default comparator), so `localeCompare(…, 'uk')` is what every
 * other name sort in this app uses.
 *
 * A null figure sorts LAST in both directions. It means «no ставка saved», not
 * «zero», and flipping the direction to bring 321 blank rows to the top would
 * bury the very thing the sort was reached for.
 */
export function sortPlanRows(
  rows: readonly SciencePlanRowSummary[],
  sort: PlanSortField | undefined,
  dir: 'asc' | 'desc'
): SciencePlanRowSummary[] {
  const byName = (a: SciencePlanRowSummary, b: SciencePlanRowSummary) =>
    a.fullName.localeCompare(b.fullName, 'uk');

  if (!sort) {
    return [...rows].sort((a, b) => {
      const aShort = isShort(a);
      const bShort = isShort(b);
      if (aShort !== bShort) return aShort ? -1 : 1;
      return byName(a, b);
    });
  }

  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort === 'name') return sign * byName(a, b);
    if (sort === 'department') {
      const byDept = a.departmentName.localeCompare(b.departmentName, 'uk');
      return byDept !== 0 ? sign * byDept : byName(a, b);
    }
    const av = figure(a, sort);
    const bv = figure(b, sort);
    if (av === null && bv === null) return byName(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    return av === bv ? byName(a, b) : sign * (av - bv);
  });
}
