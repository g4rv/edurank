import { db } from '@/lib/db';

/**
 * Which кафедри does this person oversee?
 *
 * A завідувач кафедри and a декан both get to look at their own people —
 * profiles, ratings, Характеристики, and later the ставка distribution grid.
 * Neither is a `Role`. Headship is derived from `Department.headId` and a
 * deanship from `Faculty.deanId`, because one person is routinely a head, an
 * НПП and a division editor at once, and a fourth role would have to be kept in
 * sync with the two id columns that already say it (decided 2026-08-04, Q5/Q14).
 *
 * Empty array = oversees nobody, which is the answer for most people.
 */
export async function scopeOf(staffId: string | null | undefined): Promise<string[]> {
  if (!staffId) return [];

  const [headed, deanOf] = await Promise.all([
    db.department.findMany({ where: { headId: staffId }, select: { id: true } }),
    db.faculty.findMany({ where: { deanId: staffId }, select: { id: true } }),
  ]);

  // A dean covers every кафедра of their faculty, not just one
  const facultyDepartments = deanOf.length
    ? await db.department.findMany({
        where: { facultyId: { in: deanOf.map((f) => f.id) } },
        select: { id: true },
      })
    : [];

  return [...new Set([...headed, ...facultyDepartments].map((d) => d.id))];
}

/**
 * May this person look at that person's academic record — rating tab,
 * Характеристика?
 *
 * ADMIN and EDITOR see everybody: any division member may already inspect any
 * НПП's total rating, which was confirmed as intended (W6). Beyond them, two
 * narrower routes:
 *
 * - **your own record** — the strongest reason anyone has to keep the rating
 *   filled in is seeing what it is short of;
 * - **your кафедра / факультет** — a head knows their staff, which is exactly
 *   why they are the one who distributes ставки.
 *
 * Server-side only. Callers still check `auth()` themselves; this answers the
 * «whose record» half, never the «is there a session» half.
 */
export async function canViewAcademicRecord(
  viewer: { role: string; staffId?: string | null },
  targetStaffId: string
): Promise<boolean> {
  if (viewer.role === 'ADMIN' || viewer.role === 'EDITOR') return true;
  if (viewer.staffId && viewer.staffId === targetStaffId) return true;

  const departments = await scopeOf(viewer.staffId);
  if (departments.length === 0) return false;

  const target = await db.staff.findUnique({
    where: { id: targetStaffId },
    select: { departmentId: true },
  });
  return !!target?.departmentId && departments.includes(target.departmentId);
}
