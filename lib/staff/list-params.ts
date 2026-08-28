import {
  STAFF_SORT_FIELDS,
  type StaffFilters,
  type StaffSortField,
} from '@/lib/queries/list-staff';
import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';

/**
 * The `/staff` URL, read once.
 *
 * Both the page and `/api/export/staff` have to turn the same query string into
 * the same `listStaff` call — the export's whole promise is «what is on screen,
 * in a file». Parsed in two places they would drift on the first filter anybody
 * adds, and the drift would be silent: a plausible-looking spreadsheet with the
 * wrong people in it. So the parsing lives here and both callers ask for it.
 */

const VALID_RANKS = new Set<string>(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']);
const VALID_DEGREES = new Set<string>(['CANDIDATE', 'DOCTOR']);
const VALID_TYPES = new Set<string>(['npp', 'adm', 'all']);

export type StaffType = 'npp' | 'adm' | 'all';

/** Accepts a page's resolved `searchParams` object or a route's `URLSearchParams` */
export type StaffParamSource = Record<string, string | string[] | undefined> | URLSearchParams;

function read(source: StaffParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

export interface StaffListParams {
  type: StaffType;
  isNpp: boolean | undefined;
  sort: StaffSortField;
  dir: 'asc' | 'desc';
  q: string | undefined;
  facultyId: string | undefined;
  departmentId: string | undefined;
  rank: AcademicRank | undefined;
  degree: ScientificDegree | undefined;
  partTime: boolean;
  degreeMatch: boolean;
  activated: boolean | undefined;
  archivedView: boolean;
}

export function parseStaffListParams(
  source: StaffParamSource,
  { isAdmin }: { isAdmin: boolean }
): StaffListParams {
  // ?type=npp|adm|all, keyed on isNpp — not Role. A vice-rector or the rector
  // can hold role ADMIN while still being isNpp:true, so filtering by role hid
  // them from the default view. Absent = НПП default.
  const rawType = read(source, 'type');
  const type: StaffType = rawType && VALID_TYPES.has(rawType) ? (rawType as StaffType) : 'npp';

  const rawSort = read(source, 'sort');
  const sort: StaffSortField =
    rawSort && (STAFF_SORT_FIELDS as readonly string[]).includes(rawSort)
      ? (rawSort as StaffSortField)
      : 'lastName';

  // Ставка is confidential, so sorting by it is ADMIN-only — a non-admin
  // asking for it is put back on the name rather than refused.
  const effectiveSort: StaffSortField = sort === 'employmentRate' && !isAdmin ? 'lastName' : sort;

  const rawRank = read(source, 'rank');
  const rawDegree = read(source, 'degree');

  // ?activated=1|0 — whether the person has ever set a password. ADMIN only,
  // and the guard is here rather than only on the control: activation is
  // account state, `listStaff` reads it from `passwordHash`, and an EDITOR is
  // not given `includeAccount` either. Anything else in the URL means «всі».
  const rawActivated = read(source, 'activated');
  const activated =
    !isAdmin || rawActivated === undefined
      ? undefined
      : rawActivated === '1'
        ? true
        : rawActivated === '0'
          ? false
          : undefined;

  return {
    type,
    isNpp: type === 'npp' ? true : type === 'adm' ? false : undefined,
    sort: effectiveSort,
    dir: read(source, 'dir') === 'desc' ? 'desc' : 'asc',
    q: read(source, 'q'),
    facultyId: read(source, 'faculty'),
    departmentId: read(source, 'dept'),
    rank: rawRank && VALID_RANKS.has(rawRank) ? (rawRank as AcademicRank) : undefined,
    degree: rawDegree && VALID_DEGREES.has(rawDegree) ? (rawDegree as ScientificDegree) : undefined,
    partTime: read(source, 'partTime') === '1',
    degreeMatch: read(source, 'degreeMatch') === '1',
    activated,
    // ?archived=1 is how an archived person is found again to be restored —
    // they are out of the ordinary list by design.
    archivedView: read(source, 'archived') === '1',
  };
}

/**
 * The parsed URL as a `listStaff` call.
 *
 * `includeAccount` / `includeConfidential` widen the SELECT, never the WHERE,
 * so they cannot change which people come back — which is what lets the export
 * pass the same params and be sure it got the same rows as the screen.
 */
export function toStaffFilters(
  p: StaffListParams,
  { isAdmin }: { isAdmin: boolean }
): StaffFilters {
  return {
    isNpp: p.isNpp,
    includeAccount: isAdmin,
    sort: p.sort,
    dir: p.dir,
    q: p.q,
    facultyId: p.facultyId,
    departmentId: p.departmentId,
    rank: p.rank,
    degree: p.degree,
    partTime: p.partTime,
    degreeMatch: p.degreeMatch,
    activated: p.activated,
    includeConfidential: isAdmin,
    archived: p.archivedView ? 'only' : 'exclude',
  };
}
