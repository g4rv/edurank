/**
 * Which of a person's кафедри a science page opens on.
 *
 * `?dept=` when given and theirs; otherwise the primary кафедра when it is one
 * of theirs (a сумісник with no primary has none to fall back to); otherwise
 * the first of the list — which is the whole list for everybody with only one.
 *
 * Shared by the НПП's own `/science-plan` and the record tab
 * `/staff/[id]/science`, so the two can never open different plans for the
 * same address. Never trusts the asked id: a stale or typed one is ignored.
 */
export function pickPlanDepartment(
  asked: string | undefined,
  primaryId: string | undefined,
  departments: readonly { id: string }[]
): string {
  const has = (id: string | undefined) => id !== undefined && departments.some((d) => d.id === id);
  if (has(asked)) return asked!;
  if (has(primaryId)) return primaryId!;
  return departments[0].id;
}
