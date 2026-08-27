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
 * Which кафедри does this person actually LEAD — `Department.headId`, nothing else.
 *
 * Deliberately narrower than `scopeOf`, and the difference is a декан
 * (2026-08-13). A декан oversees every кафедра of their faculty and must be
 * able to READ all of it — that is what `scopeOf` is for. But the ставка split
 * is the завідувач's decision: a декан who could retype it would be doing the
 * head's job over their head, and nothing in the положення gives them that.
 *
 * So: `scopeOf` answers «may I look», `headOf` answers «may I decide».
 */
export async function headOf(staffId: string | null | undefined): Promise<string[]> {
  if (!staffId) return [];
  const headed = await db.department.findMany({
    where: { headId: staffId },
    select: { id: true },
  });
  return headed.map((d) => d.id);
}

/**
 * Ukrainian message if this person cannot hold that post, else null.
 *
 * **A завідувач is never a декан** (owner, 2026-08-18). They are different jobs
 * at the university, and letting one person be both is not a harmless overlap:
 * a декан reads every кафедра of the факультет, so the same account then appears
 * to be a завідувач with access to кафедри that are not theirs — which is what
 * the owner reported after seeing it in the seeded data.
 *
 * Checked here rather than in a Zod schema because it needs the database: the
 * question is what this person ALREADY holds, not what the form said.
 */
export async function headDeanConflict(
  staffId: string | null | undefined,
  post: 'HEAD' | 'DEAN'
): Promise<string | null> {
  if (!staffId) return null;

  if (post === 'DEAN') {
    const heads = await db.department.findFirst({
      where: { headId: staffId },
      select: { name: true },
    });
    return heads
      ? `Ця людина вже завідує кафедрою «${heads.name}». Завідувач не може бути деканом — спершу призначте іншого завідувача.`
      : null;
  }

  const deans = await db.faculty.findFirst({ where: { deanId: staffId }, select: { name: true } });
  return deans
    ? `Ця людина вже декан факультету «${deans.name}». Декан не може бути завідувачем — спершу призначте іншого декана.`
    : null;
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
    select: {
      departmentId: true,
      // Сумісництво counts here, exactly as it does in `onDepartment`
      // (2026-08-27). `departmentId` alone stopped answering «who is on this
      // кафедра» on 2026-08-24, and this was the one place still asking it that
      // way: the head of somebody's ADDITIONAL кафедра — who sees them in their
      // own list and sets their ставка — got a 404 on their Характеристика and
      // a 403 on the Excel beside it.
      //
      // It also covers an НПП with NO primary кафедра, legal since 2026-08-26:
      // `departmentId` is null for them, so the old check made their record
      // unreadable to every head, on every кафедра they actually work on.
      partTimeDepartments: { select: { departmentId: true } },
    },
  });
  if (!target) return false;

  return [target.departmentId, ...target.partTimeDepartments.map((p) => p.departmentId)].some(
    (id) => id !== null && departments.includes(id)
  );
}
