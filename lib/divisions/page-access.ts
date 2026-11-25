/**
 * Which of the five pages a division's editors may open (owner, 2026-11-25).
 *
 * Every EDITOR used to open Штат, Кафедри, Факультети, Рейтинг НПП and Графіки
 * by their role alone; the owner put a person into the aspirantura division to
 * enter 3.18 and they got the whole rating table. Now each page is a switch on
 * the division, off by default.
 *
 * **If a division may edit, it may look.** A right that is used FROM a page
 * opens that page whatever its switch says — a division that may edit 20 fields
 * of a person must be able to find the person. The forced value is worked out
 * here from the rights and never stored, so taking the right away frees the
 * switch again.
 *
 * «Дані відділу» is not one of these: it already shows only to a division that
 * enters some indicator (`canEnterDivisionData`). Pure — no database here; the
 * signed-in user's answer is `pageAccessFor` in `./page-access-state.ts`.
 */

export const PAGE_KEYS = ['staff', 'departments', 'faculties', 'rating', 'charts'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];
export type PageAccess = Record<PageKey, boolean>;

export const ALL_PAGES: PageAccess = {
  staff: true,
  departments: true,
  faculties: true,
  rating: true,
  charts: true,
};

export const NO_PAGES: PageAccess = {
  staff: false,
  departments: false,
  faculties: false,
  rating: false,
  charts: false,
};

/** The `Division` column behind each page's switch */
export const PAGE_COLUMNS = {
  staff: 'canViewStaff',
  departments: 'canViewDepartments',
  faculties: 'canViewFaculties',
  rating: 'canViewRating',
  charts: 'canViewCharts',
} as const satisfies Record<PageKey, string>;

/** What a division may do, as far as it decides which pages it needs */
export interface DivisionRights {
  /** The five switches as ADMIN ticked them */
  switches: PageAccess;
  /** Any STAFF create / update / delete */
  staffEntity: boolean;
  /** Any DEPARTMENT create / update / delete */
  departmentEntity: boolean;
  /** Any FACULTY create / update / delete */
  facultyEntity: boolean;
  /** At least one field of a person they may edit */
  fieldGrants: boolean;
  /** Invites, passwords or ending sessions */
  accountSwitches: boolean;
  canViewQualifications: boolean;
  canOverseeScience: boolean;
  canModerateRating: boolean;
}

/** Why a page is on whatever its switch says */
export type ForceReason =
  | 'staffEntity'
  | 'fieldGrants'
  | 'accountSwitches'
  | 'qualifications'
  | 'science'
  | 'moderation'
  | 'departmentEntity'
  | 'facultyEntity';

/** The pages a division's rights open, each with every right that opens it */
export function forcedPages(
  rights: Omit<DivisionRights, 'switches'>
): Partial<Record<PageKey, ForceReason[]>> {
  const staff: ForceReason[] = [];
  if (rights.staffEntity) staff.push('staffEntity');
  if (rights.fieldGrants) staff.push('fieldGrants');
  if (rights.accountSwitches) staff.push('accountSwitches');
  if (rights.canViewQualifications) staff.push('qualifications');
  if (rights.canOverseeScience) staff.push('science');

  const forced: Partial<Record<PageKey, ForceReason[]>> = {};
  if (staff.length > 0) forced.staff = staff;
  if (rights.canModerateRating) forced.rating = ['moderation'];
  if (rights.departmentEntity) forced.departments = ['departmentEntity'];
  if (rights.facultyEntity) forced.faculties = ['facultyEntity'];
  return forced;
}

/** The pages a division's editors open: the switch, or a right that forces it */
export function divisionPageAccess(rights: DivisionRights): PageAccess {
  const forced = forcedPages(rights);
  return {
    staff: rights.switches.staff || !!forced.staff,
    departments: rights.switches.departments || !!forced.departments,
    faculties: rights.switches.faculties || !!forced.faculties,
    rating: rights.switches.rating || !!forced.rating,
    charts: rights.switches.charts || !!forced.charts,
  };
}

/**
 * Where a person's name links for this viewer: the Профіль with «Штат», the
 * Рейтинг with «Рейтинг НПП» alone, otherwise nowhere — a name is plain text
 * rather than a link to a page that would send them away.
 */
export function personHref(access: PageAccess, staffId: string): string | null {
  if (access.staff) return `/staff/${staffId}`;
  if (access.rating) return `/staff/${staffId}/rating`;
  return null;
}
