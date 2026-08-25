import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { hasNoEmail } from '@/app/(dashboard)/admin/invites/shared';

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

/** One address domain present in the list, and how many people carry it */
export interface InviteDomain {
  /** Lower-cased, without the «@» — e.g. `uhsp.edu.ua` */
  domain: string;
  count: number;
  /**
   * A reserved `.invalid` placeholder: nothing can ever be delivered to it, and
   * `inviteBatch` refuses these one by one. Flagged so the picker can say so
   * before somebody presses send, rather than after 33 failures.
   */
  undeliverable: boolean;
}

export interface PendingInviteFilter {
  departmentId?: string;
  /** Undefined means both kinds */
  isNpp?: boolean;
  /**
   * Only people whose address is on this domain, lower-cased and without «@».
   *
   * Not every НПП has their corporate address on file yet, and those who do not
   * carry a `no-email.invalid` placeholder. An ADMIN must be able to write to
   * the ones that are ready without the rest being in the batch at all (owner,
   * 2026-08-25).
   */
  domain?: string;
}

export interface PendingInvites {
  people: PendingInvite[];
  /**
   * Every domain in the кафедра/kind selection, counted BEFORE `filter.domain`
   * is applied — otherwise choosing one domain would leave the picker holding
   * only that domain and no way back to the others.
   */
  domains: InviteDomain[];
}

/** The part after the last «@», lower-cased. Empty when there is no «@». */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1
    ? ''
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/**
 * The domains in a set of addresses, commonest first, with every undeliverable
 * one last however many people are on it — nobody picks that group to send to.
 */
export function inviteDomains(emails: readonly string[]): InviteDomain[] {
  const counts = new Map<string, number>();
  for (const email of emails) {
    const domain = emailDomain(email);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([domain, count]) => ({
      domain,
      count,
      undeliverable: hasNoEmail(domain),
    }))
    .sort(
      (a, b) =>
        Number(a.undeliverable) - Number(b.undeliverable) ||
        b.count - a.count ||
        a.domain.localeCompare(b.domain)
    );
}

export async function listPendingInvites(
  filter: PendingInviteFilter = {}
): Promise<PendingInvites> {
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

  const all = rows.map(
    (r): PendingInvite => ({
      id: r.id,
      fullName: `${r.lastName} ${r.firstName} ${r.patronymic}`,
      email: r.email,
      isNpp: r.isNpp,
      departmentName: r.department?.name ?? null,
      invitedAt: r.activationToken?.createdAt ?? null,
    })
  );

  // The domain filter is applied in memory rather than in the `where`. There are
  // ~300 rows in the whole university, the picker needs the counts of the OTHER
  // domains anyway, and doing both from one read keeps the page at one query.
  const domain = filter.domain?.trim().toLowerCase();
  return {
    people: domain ? all.filter((p) => emailDomain(p.email) === domain) : all,
    domains: inviteDomains(all.map((p) => p.email)),
  };
}
