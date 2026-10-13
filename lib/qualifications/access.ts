import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * Who may do what with ONE person's qualification records (owner, 2026-10-13).
 *
 * | caller                                   | read | write |
 * | ---------------------------------------- | ---- | ----- |
 * | the НПП themself                         | yes  | yes   |
 * | ADMIN                                    | yes  | yes   |
 * | EDITOR, division `canViewQualifications` | yes  | no    |
 * | anybody else (a head, a декан, a USER)   | no   | no    |
 *
 * **Only an НПП has records at all.** An administrative account has no tab and
 * every action refuses it, whoever asks — `ownerIsNpp` is the caller's check
 * that the record's owner is one.
 *
 * Pure, so the table is tested without a database; the one query (the
 * division's switch) is `divisionAllowsQualifications` below.
 */
export interface QualificationAccess {
  read: boolean;
  write: boolean;
}

export const NO_ACCESS: QualificationAccess = { read: false, write: false };

export function qualificationAccessFor(input: {
  role: Role;
  /** The caller's `Staff.id`; null for a session with none. */
  staffId: string | null | undefined;
  /** Whether the caller's division carries `canViewQualifications`. */
  divisionAllows: boolean;
  /** The `Staff.id` the records belong to. */
  ownerId: string;
  ownerIsNpp: boolean;
}): QualificationAccess {
  if (!input.ownerIsNpp) return NO_ACCESS;
  if (input.role === 'ADMIN') return { read: true, write: true };
  if (input.staffId && input.staffId === input.ownerId) return { read: true, write: true };
  if (input.role === 'EDITOR' && input.divisionAllows) return { read: true, write: false };
  return NO_ACCESS;
}

/** Does this caller's division carry the switch? ADMIN needs none. */
export async function divisionAllowsQualifications(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role !== 'EDITOR' || !user.staffId) return false;
  const staff = await db.staff.findUnique({
    where: { id: user.staffId },
    select: { division: { select: { canViewQualifications: true } } },
  });
  return staff?.division?.canViewQualifications === true;
}

/**
 * May this caller open ANYBODY's qualification tab — what the tab bar on a
 * record asks. ADMIN, or an EDITOR whose division carries the switch. A flag on
 * a tab is not a permission: `/staff/[id]/qualifications` and every action
 * check `qualificationAccessFor` again.
 */
export async function canViewAnyQualifications(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  return divisionAllowsQualifications(user);
}
