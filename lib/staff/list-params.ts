import {
  STAFF_SORT_FIELDS,
  type StaffFilters,
  type StaffSortField,
} from '@/lib/queries/list-staff';
import type { AcademicTitle, AdminPosition, StaffPosition } from '@/lib/generated/prisma/client';
import { CANDIDATE_DEGREES, DOCTOR_DEGREES, HONORARY_TITLES } from '@/lib/staff/academic-options';
import { ADMIN_POSITIONS } from '@/validations/staff';

/**
 * The `/staff` URL, read once.
 *
 * Both the page and `/api/export/staff` have to turn the same query string into
 * the same `listStaff` call — the export's whole promise is «what is on screen,
 * in a file». Parsed in two places they would drift on the first filter anybody
 * adds, and the drift would be silent: a plausible-looking spreadsheet with the
 * wrong people in it. So the parsing lives here and both callers ask for it.
 */

const VALID_POSITIONS = new Set<string>(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']);
const VALID_TITLES = new Set<string>(['SENIOR_RESEARCHER', 'DOCENT', 'PROFESSOR']);
/** A whole level, or any one exact degree (owner, 2026-10-06) */
const VALID_DEGREES = new Set<string>([
  'CANDIDATE',
  'DOCTOR',
  ...CANDIDATE_DEGREES.map((d) => d.value),
  ...DOCTOR_DEGREES.map((d) => d.value),
]);
const VALID_ADMIN = new Set<string>(ADMIN_POSITIONS);
const VALID_HONORS = new Set<string>(HONORARY_TITLES.map((h) => h.value));

/** A URL value if it is one of the allowed ones, else nothing at all */
function oneOf<T extends string>(value: string | undefined, valid: Set<string>): T | undefined {
  return value && valid.has(value) ? (value as T) : undefined;
}
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
  position: StaffPosition | undefined;
  title: AcademicTitle | undefined;
  degree: string | undefined;
  adminPosition: AdminPosition | undefined;
  honoraryTitle: string | undefined;
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

  // `academicRank` was the sort key until the посада got its own field
  // (2026-10-06); a bookmarked link still sorts by it.
  const rawSortParam = read(source, 'sort');
  const rawSort = rawSortParam === 'academicRank' ? 'position' : rawSortParam;
  const sort: StaffSortField =
    rawSort && (STAFF_SORT_FIELDS as readonly string[]).includes(rawSort)
      ? (rawSort as StaffSortField)
      : 'lastName';

  // Ставка is confidential, so sorting by it is ADMIN-only — a non-admin
  // asking for it is put back on the name rather than refused.
  const effectiveSort: StaffSortField = sort === 'employmentRate' && !isAdmin ? 'lastName' : sort;

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
    // `rank` is the old name of this filter, which always held the посада —
    // a link made before 2026-10-06 keeps working.
    position: oneOf(read(source, 'position') ?? read(source, 'rank'), VALID_POSITIONS),
    title: oneOf(read(source, 'title'), VALID_TITLES),
    degree: oneOf(read(source, 'degree'), VALID_DEGREES),
    adminPosition: oneOf(read(source, 'admin'), VALID_ADMIN),
    honoraryTitle: oneOf(read(source, 'honor'), VALID_HONORS),
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
    position: p.position,
    title: p.title,
    degree: p.degree,
    adminPosition: p.adminPosition,
    honoraryTitle: p.honoraryTitle,
    partTime: p.partTime,
    degreeMatch: p.degreeMatch,
    activated: p.activated,
    includeConfidential: isAdmin,
    archived: p.archivedView ? 'only' : 'exclude',
  };
}

/**
 * The academic filters as URL params — what a page puts back into every link
 * it builds (sort, page). One place, so `/staff` and «Мій факультет» cannot
 * drop a filter the other keeps.
 */
export function academicFilterParams(p: StaffListParams): Record<string, string | undefined> {
  return {
    position: p.position,
    title: p.title,
    degree: p.degree,
    admin: p.adminPosition,
    honor: p.honoraryTitle,
  };
}
