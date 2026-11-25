import { db } from '@/lib/db';
import type { AdminPosition, Role } from '@/lib/generated/prisma/client';
import { pageAccessFor } from '@/lib/divisions/page-access-state';
import { adminPostProblem, headshipOf } from '@/lib/staff/academic';
import { ADMIN_POST_PROBLEM_MESSAGES } from '@/validations/staff';

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
 * The кафедри this person is заступник завідувача з наукової роботи of —
 * `Department.scienceDeputyId`. Two things only: they fill Рейтинг кафедри
 * beside the завідувач (owner, 2026-10-21), and they READ their кафедра's
 * people — «Моя кафедра» without the ставки, and each person's profile, rating
 * and Характеристика (owner, 2026-11-16, through `canViewAcademicRecord`).
 *
 * Still NOT part of `scopeOf` or `headOf`: no ставка, no students, no
 * qualifications, nothing decided.
 */
export async function scienceDeputyOf(staffId: string | null | undefined): Promise<string[]> {
  if (!staffId) return [];
  const rows = await db.department.findMany({
    where: { scienceDeputyId: staffId },
    select: { id: true },
  });
  return rows.map((d) => d.id);
}

/**
 * The факультети this person is декан of — the dean half of `scopeOf`, for the
 * screens that are about a факультет as a whole («Мій факультет»). Almost
 * always one; a list for the same reason `headOf` is one.
 */
export async function deanOf(
  staffId: string | null | undefined
): Promise<{ id: string; name: string }[]> {
  if (!staffId) return [];
  return db.faculty.findMany({
    where: { deanId: staffId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
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
 * Nor is somebody named who already holds another leading post on their
 * profile — a проректор, a керівник відділу (owner, 2026-10-06, see
 * `adminPostProblem`).
 *
 * Checked here rather than in a Zod schema because it needs the database: the
 * question is what this person ALREADY holds, not what the form said.
 */
export async function headDeanConflict(
  staffId: string | null | undefined,
  post: 'HEAD' | 'DEAN'
): Promise<string | null> {
  if (!staffId) return null;

  const picked = await db.staff.findUnique({
    where: { id: staffId },
    select: { adminPositions: true },
  });
  const problem = adminPostProblem(
    picked?.adminPositions ?? [],
    post === 'DEAN' ? 'DEAN' : 'DEPARTMENT_HEAD'
  );
  if (problem) {
    return `${ADMIN_POST_PROBLEM_MESSAGES[problem]}. Спершу приберіть іншу посаду в профілі цієї людини.`;
  }

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
 * ADMIN sees everybody, and so does an EDITOR whose division opens «Рейтинг
 * НПП» (owner, 2026-11-25 — every editor did before, W6; the aspirantura
 * division's member got the whole rating with it). Beyond them, three narrower
 * routes, which an editor takes like anybody else:
 *
 * - **your own record** — the strongest reason anyone has to keep the rating
 *   filled in is seeing what it is short of;
 * - **your кафедра / факультет** — a head knows their staff, which is exactly
 *   why they are the one who distributes ставки;
 * - **the кафедра you are заступник з наукової роботи of** (owner,
 *   2026-11-16) — they fill Рейтинг кафедри from these people's work.
 *
 * Server-side only. Callers still check `auth()` themselves; this answers the
 * «whose record» half, never the «is there a session» half.
 */
export async function canViewAcademicRecord(
  viewer: { role: string; staffId?: string | null },
  targetStaffId: string
): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true;
  if (viewer.staffId && viewer.staffId === targetStaffId) return true;
  if (viewer.role === 'EDITOR' && (await pageAccessFor(asViewer(viewer))).rating) return true;
  return readsThroughPosition(viewer.staffId, targetStaffId);
}

/**
 * The position routes into somebody's record: a завідувач or декан of a кафедра
 * they work on, or its заступник з наукової роботи. The same for every role —
 * an editor who heads a кафедра keeps reading their own people.
 */
async function readsThroughPosition(
  viewerStaffId: string | null | undefined,
  targetStaffId: string
): Promise<boolean> {
  // The заступник з наукової роботи reads here too (owner, 2026-11-16) — and
  // ONLY here: `overseesStaff`, which opens the qualification files, stays the
  // head's and the декан's.
  const [overseen, deputised] = await Promise.all([
    scopeOf(viewerStaffId),
    scienceDeputyOf(viewerStaffId),
  ]);
  return worksOnAny(targetStaffId, [...overseen, ...deputised]);
}

/**
 * May this person open that person's Профіль tab (owner, 2026-11-25)? ADMIN,
 * the person themself, an EDITOR whose division opens «Штат» (or has a right
 * used from it), and — as since 2026-09-24 — a завідувач, декан or заступник of
 * a кафедра the person works on.
 */
export async function canViewStaffProfile(
  viewer: { role: string; staffId?: string | null },
  targetStaffId: string
): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true;
  if (viewer.staffId && viewer.staffId === targetStaffId) return true;
  if (viewer.role === 'EDITOR' && (await pageAccessFor(asViewer(viewer))).staff) return true;
  return readsThroughPosition(viewer.staffId, targetStaffId);
}

/**
 * Which tabs of a person's record this viewer opens: the Профіль, and the
 * Рейтинг with the Характеристика (owner, 2026-11-25). Every record tab passes
 * both to `RecordTabRow`, so a tab that would refuse is never drawn.
 */
export async function recordTabsFor(
  viewer: { role: string; staffId?: string | null },
  targetStaffId: string
): Promise<{ profile: boolean; academic: boolean }> {
  const [profile, academic] = await Promise.all([
    canViewStaffProfile(viewer, targetStaffId),
    canViewAcademicRecord(viewer, targetStaffId),
  ]);
  return { profile, academic };
}

/** The session's role is a string here; the loader takes the enum */
const asViewer = (viewer: { role: string; staffId?: string | null }) => ({
  role: viewer.role as Role,
  staffId: viewer.staffId,
});

/**
 * Is this person a завідувач of a кафедра the target works on, or a декан of its
 * факультет — nothing else? The «my people» half of `canViewAcademicRecord`,
 * for a screen that wants it without the ADMIN / EDITOR / own-record shortcuts
 * (the qualifications of a head's staff, 2026-11-06).
 */
export async function overseesStaff(
  overseerStaffId: string | null | undefined,
  targetStaffId: string
): Promise<boolean> {
  return worksOnAny(targetStaffId, await scopeOf(overseerStaffId));
}

/** Does the target work on any of these кафедри — primary or сумісник? */
async function worksOnAny(targetStaffId: string, departments: readonly string[]): Promise<boolean> {
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

/**
 * Ukrainian message if this person cannot hold these picked posts beside their
 * headship, else null (owner, 2026-10-06). The form already refuses a bad list
 * on its own; only the database knows the headship, so the save asks again.
 */
export async function adminPostsConflict(
  staffId: string,
  picked: readonly AdminPosition[]
): Promise<string | null> {
  const held = await db.staff.findUnique({
    where: { id: staffId },
    select: { headOfDepartment: { select: { id: true } }, deanOfFaculty: { select: { id: true } } },
  });
  const problem = adminPostProblem(picked, held ? headshipOf(held) : null);
  return problem ? ADMIN_POST_PROBLEM_MESSAGES[problem] : null;
}
