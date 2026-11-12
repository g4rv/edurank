/**
 * The filters of `/admin/kharakterystyka-check` (owner, 2026-11-12): a name
 * search and a few narrowing choices over the rows already on the page. Pure
 * and free of the database, so the rules are tested without a screen.
 */

export const ALL = 'all';

/** What a person with no main кафедра is listed under */
export const NO_FACULTY = 'Без основної кафедри';
export const NO_DEPARTMENT = '—';

export interface YearCheckFilters {
  /** Name search — every word must be found in the person's name */
  q: string;
  faculty: string;
  department: string;
  source: string;
  position: string;
  /** The year the line was filed under */
  filed: string;
}

export const NO_FILTERS: YearCheckFilters = {
  q: '',
  faculty: ALL,
  department: ALL,
  source: ALL,
  position: ALL,
  filed: ALL,
};

interface Filterable {
  staffName: string;
  facultyName: string | null;
  departmentName: string | null;
  source: string;
  position: number;
  filedYear: number;
}

/**
 * A name the way it is searched: lower case, apostrophes dropped («Дем'яненко»
 * is typed with three different marks), spaces collapsed.
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’ʼ`‘]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function facultyOf(row: Pick<Filterable, 'facultyName'>): string {
  return row.facultyName ?? NO_FACULTY;
}

export function departmentOf(row: Pick<Filterable, 'departmentName'>): string {
  return row.departmentName ?? NO_DEPARTMENT;
}

export function isFiltered(f: YearCheckFilters): boolean {
  return (
    normaliseName(f.q) !== '' ||
    f.faculty !== ALL ||
    f.department !== ALL ||
    f.source !== ALL ||
    f.position !== ALL ||
    f.filed !== ALL
  );
}

export function matchesFilters(row: Filterable, f: YearCheckFilters): boolean {
  const words = normaliseName(f.q).split(' ').filter(Boolean);
  if (words.length > 0) {
    const name = normaliseName(row.staffName);
    if (!words.every((w) => name.includes(w))) return false;
  }
  if (f.faculty !== ALL && facultyOf(row) !== f.faculty) return false;
  if (f.department !== ALL && departmentOf(row) !== f.department) return false;
  if (f.source !== ALL && row.source !== f.source) return false;
  if (f.position !== ALL && String(row.position) !== f.position) return false;
  if (f.filed !== ALL && String(row.filedYear) !== f.filed) return false;
  return true;
}
