import { headOf, scienceDeputyOf, scopeOf } from '@/lib/queries/scope';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * Who may read and who may save a кафедра's Рейтинг кафедри report.
 *
 * The завідувач and the заступник завідувача з наукової роботи fill it (owner,
 * 2026-10-20 / 2026-10-21 — the заступник is who actually does, the завідувач
 * keeps the right); a декан reads their факультет's reports and changes none.
 * ADMIN does both everywhere. An EDITOR gets nothing: a division has no part
 * in it.
 *
 * The заступник's right lives here and nowhere else — `scienceDeputyOf` is not
 * part of `scopeOf`, so it opens no other head screen.
 *
 * The one door — the pages, the action and the export all ask here.
 */
export interface ReportAccess {
  canView: boolean;
  canEdit: boolean;
}

type User = { role: Role; staffId?: string | null };

export async function reportAccessFor(user: User, departmentId: string): Promise<ReportAccess> {
  if (user.role === 'ADMIN') return { canView: true, canEdit: true };
  const [led, deputised, seen] = await Promise.all([
    headOf(user.staffId),
    scienceDeputyOf(user.staffId),
    scopeOf(user.staffId),
  ]);
  const canEdit = led.includes(departmentId) || deputised.includes(departmentId);
  return { canView: canEdit || seen.includes(departmentId), canEdit };
}

/** The кафедри this person's list shows: every one for ADMIN, else their scope and deputyships. */
export async function visibleDepartmentIds(user: User): Promise<string[] | 'all'> {
  if (user.role === 'ADMIN') return 'all';
  const [seen, deputised] = await Promise.all([
    scopeOf(user.staffId),
    scienceDeputyOf(user.staffId),
  ]);
  return [...new Set([...seen, ...deputised])];
}
