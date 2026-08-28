import { db } from '@/lib/db';
import type { SpecialityOwners } from '@/lib/specialities/origin';
import { SPECIALITY_DEPARTMENTS, normaliseDepartmentName } from '@/lib/specialities/departments';

/**
 * Спеціальність → the кафедри that graduate it, as ids.
 *
 * **The fallback is deliberate and temporary.** Until
 * `pnpm db:link-speciality-departments --apply` has run on a database, the table
 * is empty and this derives the same answer from the old constant by matching
 * кафедра names — so deploying the read path changes nothing anywhere, including
 * on production. One row in the table switches the fallback off entirely:
 * mixing the two would hide a half-finished backfill behind stale guesses.
 *
 * Remove the fallback once production is verified (Task 8 of the plan).
 */
export async function getSpecialityOwners(): Promise<SpecialityOwners> {
  const links = await db.specialityDepartment.findMany({
    select: { departmentId: true, speciality: { select: { name: true } } },
  });

  if (links.length > 0) {
    const owners = new Map<string, string[]>();
    for (const link of links) {
      const list = owners.get(link.speciality.name) ?? [];
      list.push(link.departmentId);
      owners.set(link.speciality.name, list);
    }
    return owners;
  }

  return fallbackFromConstant();
}

/** Спеціальність → кафедра NAMES. Display only — never use it to decide a link. */
export async function getSpecialityOwnerNames(): Promise<ReadonlyMap<string, readonly string[]>> {
  const [owners, departments] = await Promise.all([
    getSpecialityOwners(),
    db.department.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = new Map(departments.map((d) => [d.id, d.name]));
  const result = new Map<string, string[]>();
  for (const [speciality, ids] of owners) {
    result.set(
      speciality,
      ids.map((id) => nameById.get(id)).filter((name): name is string => !!name)
    );
  }
  return result;
}

/** The ONLY place in the running app that still matches a кафедра by name. */
async function fallbackFromConstant(): Promise<SpecialityOwners> {
  const departments = await db.department.findMany({ select: { id: true, name: true } });
  const idByName = new Map(departments.map((d) => [normaliseDepartmentName(d.name), d.id]));

  const owners = new Map<string, string[]>();
  for (const [speciality, names] of Object.entries(SPECIALITY_DEPARTMENTS)) {
    const ids = names
      .map((name) => idByName.get(normaliseDepartmentName(name)))
      .filter((id): id is string => !!id);
    if (ids.length > 0) owners.set(speciality, ids);
  }
  return owners;
}
