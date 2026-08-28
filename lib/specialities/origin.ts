/**
 * Where a recruited student's спеціальність sits relative to one кафедра.
 *
 * Pure and synchronous on purpose: the decision is needed per chip in a CLIENT
 * component, which cannot read the database. The server loads the map once
 * (`lib/queries/get-speciality-departments.ts`), decides here, and hands the
 * answer down already made.
 *
 * Keyed by department **id**. Names are editable and the 2026 reorganisation
 * changes most of them — see the model comment on `SpecialityDepartment`.
 */
export type SpecialityOrigin = 'own' | 'other' | 'unknown';

/** Спеціальність NAME → the ids of the кафедри that graduate it */
export type SpecialityOwners = ReadonlyMap<string, readonly string[]>;

/**
 * `unknown` is a real third answer, not a fallback we tolerate.
 *
 * A кафедра nobody has linked yet, or a спеціальність nobody graduates, means we
 * do not know. Reporting either as `other` would tell a завідувач their people
 * recruit for strangers, which is a claim we cannot support.
 */
export function originOf(
  owners: SpecialityOwners,
  speciality: string,
  departmentId: string
): SpecialityOrigin {
  if (!knowsDepartment(owners, departmentId)) return 'unknown';

  const ids = owners.get(speciality);
  if (!ids || ids.length === 0) return 'unknown';

  return ids.includes(departmentId) ? 'own' : 'other';
}

/** Does this кафедра graduate anything at all? */
export function knowsDepartment(owners: SpecialityOwners, departmentId: string): boolean {
  for (const ids of owners.values()) {
    if (ids.includes(departmentId)) return true;
  }
  return false;
}
