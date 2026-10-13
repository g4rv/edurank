import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';
import {
  divisionAllowsQualifications,
  qualificationAccessFor,
  type QualificationAccess,
} from '@/lib/qualifications/access';

export const NOT_ALLOWED = 'Недостатньо прав';

export interface QualificationCaller {
  /** The session user's id — what the audit log records. */
  userId: string;
  role: Role;
  staffId: string | null;
  /** Whose records these are. */
  owner: { id: string; lastName: string; firstName: string; patronymic: string };
  access: QualificationAccess;
}

/**
 * The one door every qualification action goes through: a session, the owner
 * of the records (who must be an НПП), and what THIS caller may do with them.
 *
 * Re-derived on every call and never taken from the client. The tab bar hides
 * a tab, which is not a permission; this is.
 */
export async function authoriseQualifications(
  ownerId: string,
  need: 'read' | 'write'
): Promise<{ ok: true; caller: QualificationCaller } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session || !userId) return { error: NOT_ALLOWED };

  const owner = await db.staff.findUnique({
    where: { id: ownerId },
    select: { id: true, isNpp: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!owner) return { error: 'Працівника не знайдено' };

  const { role, staffId } = session.user;
  // The division is asked only when it can change the answer: a read by an
  // EDITOR. A write never depends on it — the switch is read-only by design.
  const divisionAllows =
    need === 'read' && role === 'EDITOR' && (await divisionAllowsQualifications(session.user));

  const access = qualificationAccessFor({
    role,
    staffId,
    divisionAllows,
    ownerId: owner.id,
    ownerIsNpp: owner.isNpp,
  });
  if (!access[need]) return { error: NOT_ALLOWED };

  return { ok: true, caller: { userId, role, staffId, owner, access } };
}

/** «Петренко П. П.» — a short name for an audit label. */
export function shortName(p: { lastName: string; firstName: string; patronymic: string }): string {
  const initial = (s: string) => (s ? `${s[0].toUpperCase()}.` : '');
  return `${p.lastName} ${initial(p.firstName)}${initial(p.patronymic)}`.trim();
}
