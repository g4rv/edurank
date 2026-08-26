/**
 * «Місця роботи» — where one person holds a post, and on what terms.
 *
 * THE ONE PLACE THAT KNOWS HOW THIS IS STORED. Everything else — the form, the
 * actions, the pages — works in the uniform list below, and this file splits it
 * into the two columns the database uses today: `Staff.departmentId` for the
 * full-time post and `StaffDepartment` rows for the part-time ones.
 *
 * WHY A SPLIT AT ALL. Because сумісництво turned out not to mean «a second
 * кафедра» but «a part-time post» (owner, 2026-08-26), and the two are not the
 * same fact: somebody whose main job is not at the university holds part-time
 * posts and no full-time one anywhere. The storage happens to express every
 * such case exactly — `departmentId` IS the full-time post, a `StaffDepartment`
 * row IS a part-time one — so nothing had to move to say it correctly.
 *
 * Verified rather than assumed: all 327 people in `prod-core.json` convert to
 * this list and back unchanged, and the shapes are covered in the tests beside
 * this file.
 *
 * WHEN TO REPLACE IT. The split storage has one real weakness: a workplace can
 * carry no facts of its own, because half of it is a scalar column. The day one
 * needs a посада, a start date or a contract number, this file becomes a
 * `StaffWorkplace` table and a data migration — and nothing that imports it has
 * to change. That is the whole reason it exists. Deferred deliberately until
 * розподіл ставок is finished (owner, 2026-08-26), because the requirements are
 * still arriving and migrating now would lock in a guess.
 */

export type Workplace = {
  departmentId: string;
  /** Сумісник — a part-time post. `false` is the person's full-time place. */
  isPartTime: boolean;
};

/** How the two кафедра columns arrive from a form or a database row. */
export type WorkplaceStorage = {
  departmentId: string | null;
  partTimeDepartmentIds: string[];
};

/**
 * Storage → the list.
 *
 * The full-time post comes first: it is the one a person names when asked where
 * they work, and the list is what the UI renders in order.
 */
export function toWorkplaces(stored: {
  departmentId: string | null;
  partTimeDepartmentIds: readonly string[];
}): Workplace[] {
  return [
    ...(stored.departmentId ? [{ departmentId: stored.departmentId, isPartTime: false }] : []),
    ...stored.partTimeDepartmentIds.map((departmentId) => ({ departmentId, isPartTime: true })),
  ];
}

/**
 * The list → storage.
 *
 * Only one workplace can be full-time, and the storage cannot hold two — so a
 * list that breaks that rule is refused by `workplaceProblem` before it ever
 * reaches here, and this takes the first.
 *
 * A row whose кафедра has not been chosen yet is dropped rather than saved as
 * an empty string: the form adds an empty row the moment «додати кафедру» is
 * pressed, and half-filled is not a state the database should learn about.
 */
export function toStorage(workplaces: readonly Workplace[]): WorkplaceStorage {
  const chosen = workplaces.filter((w) => w.departmentId !== '');

  return {
    departmentId: chosen.find((w) => !w.isPartTime)?.departmentId ?? null,
    partTimeDepartmentIds: chosen.filter((w) => w.isPartTime).map((w) => w.departmentId),
  };
}

/**
 * The Ukrainian sentence for what is wrong with this list, or null.
 *
 * «At most one full-time post» used to be enforced by the shape of the storage
 * — there was one column and it could hold one кафедра. A uniform list can hold
 * two, so the rule has to be written down and tested.
 *
 * A row with no кафедра chosen is ignored, not an error: an empty row is what
 * «додати кафедру» produces, and the form must not go red the instant it is
 * pressed. The «at least one кафедра» rule lives in `validations/staff.ts`,
 * which is where the save is refused.
 */
export function workplaceProblem(workplaces: readonly Workplace[]): string | null {
  const chosen = workplaces.filter((w) => w.departmentId !== '');

  if (chosen.length > 2) return 'Не більше двох місць роботи';
  if (chosen.filter((w) => !w.isPartTime).length > 1) {
    return 'Основне місце роботи може бути лише одне';
  }
  if (new Set(chosen.map((w) => w.departmentId)).size !== chosen.length) {
    return 'Кафедра вказана двічі';
  }
  return null;
}
