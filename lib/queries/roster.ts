import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * Everyone still on the active roster.
 *
 * Archived people (left the university, декретна відпустка) keep every row they
 * ever had — that is the point of archiving rather than deleting — so every
 * list an editor works from, and every number for the CURRENT year, has to
 * exclude them explicitly. Closed years are the exception: their ranking is
 * frozen history and must keep showing whoever was in it, archived since or not.
 *
 * Spread it into a `where`, so the rule is one greppable thing rather than
 * eleven copies of a null check:
 *
 *   where: { ...ON_ROSTER, isNpp: true }
 */
export const ON_ROSTER = {
  archivedAt: null,
  // The seeded core administrator is not a colleague. It exists so a fresh
  // database is never locked out, and it has no кафедра, no rating and no
  // ставка — counting it would put a phantom person on somebody's кафедра and
  // one extra head in every «N НПП».
  isSystem: false,
} satisfies Prisma.StaffWhereInput;

/**
 * Everyone who is a real person, archived or not.
 *
 * For the places `ON_ROSTER` is deliberately skipped — a CLOSED year keeps the
 * people who were in it — where a service account still has no business
 * appearing.
 */
export const REAL_PEOPLE = { isSystem: false } satisfies Prisma.StaffWhereInput;

/**
 * Everyone attached to this кафедра — primary or сумісник.
 *
 * Since 2026-08-24 an НПП may hold posts on two кафедри and BOTH pay them a
 * ставка, so «who is on this кафедра» is no longer `departmentId` alone. Eight
 * queries used to write that filter by hand; spread this instead, so the rule
 * is one greppable thing rather than eight copies that drift apart:
 *
 *   where: { ...ON_ROSTER, isNpp: true, ...onDepartment(id) }
 *
 * A row's own `departmentId` compared against the кафедра being viewed is what
 * tells primary from сумісник — no extra column is needed anywhere.
 *
 * Note it produces an `OR`, so it cannot be spread beside another top-level
 * `OR` in the same object. Where a query already has one, put both inside `AND`.
 */
export const onDepartment = (departmentId: string) => ({
  OR: [{ departmentId }, { partTimeDepartments: { some: { departmentId } } }],
});

/** The same for several кафедри at once — one query, not one per кафедра. */
export const onDepartments = (departmentIds: readonly string[]) => ({
  OR: [
    { departmentId: { in: [...departmentIds] } },
    { partTimeDepartments: { some: { departmentId: { in: [...departmentIds] } } } },
  ],
});

/**
 * Everyone on any кафедра of this факультет — primary or сумісник.
 *
 * The faculty filter used to be `{ department: { facultyId } }`, which reads a
 * person's PRIMARY кафедра only, while the кафедра filter beside it already
 * used `onDepartment`. Both are ANDed, and both selects stay in the URL, so
 * picking a факультет and then one of its кафедри silently subtracted the
 * сумісники the кафедра filter had just found: Кафедра соціальних комунікацій
 * showed 18 people on its own and 15 arrived at through the факультет above it
 * (2026-08-27, seen on screen — and the dashboard tree says 18).
 *
 * Same `OR` caveat as `onDepartment`: put it in an `AND` list rather than
 * beside another top-level `OR`.
 */
export const onFaculty = (facultyId: string) => ({
  OR: [
    { department: { facultyId } },
    { partTimeDepartments: { some: { department: { facultyId } } } },
  ],
});
