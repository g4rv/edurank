import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';

/**
 * Everyone who still has no account.
 *
 * `passwordHash === null` is the definition of «not activated» across the whole
 * app (`authorize` in lib/auth.ts, `sendInvite`), so it is the definition here
 * too rather than some new flag. Archived people are excluded: they cannot sign
 * in even with a valid token, so mailing them a link would be a lie.
 *
 * `invitedAt` comes from the live ActivationToken. There is at most one per
 * person (`staffId @unique`) and issuing a new one replaces it, so this is
 * «when the last invite went out», which is exactly what somebody deciding
 * whether to send again needs to see. Invites write no audit-log entry — the
 * token row is the trace.
 */

export interface PendingInvite {
  id: string;
  fullName: string;
  email: string;
  isNpp: boolean;
  departmentName: string | null;
  invitedAt: Date | null;
}

export interface PendingInviteFilter {
  departmentId?: string;
  /** Undefined means both kinds */
  isNpp?: boolean;
}

export async function listPendingInvites(filter: PendingInviteFilter = {}) {
  const rows = await db.staff.findMany({
    where: {
      ...ON_ROSTER,
      passwordHash: null,
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.isNpp === undefined ? {} : { isNpp: filter.isNpp }),
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      email: true,
      isNpp: true,
      department: { select: { name: true } },
      activationToken: { select: { createdAt: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return rows.map(
    (r): PendingInvite => ({
      id: r.id,
      fullName: `${r.lastName} ${r.firstName} ${r.patronymic}`,
      email: r.email,
      isNpp: r.isNpp,
      departmentName: r.department?.name ?? null,
      invitedAt: r.activationToken?.createdAt ?? null,
    })
  );
}
