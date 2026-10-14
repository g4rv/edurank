import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  canMutateStaffRecord,
  getDivisionFieldGrants,
  getEditorDivisionId,
  hasEntityPermission,
} from '@/lib/permissions';
import { CERTIFICATE_FIELDS, type CertificateKind } from '@/lib/language-certificates/options';

export const NOT_ALLOWED = 'Недостатньо прав';

/**
 * May this caller WRITE one person's language certificate — and so mint an upload
 * key for its scan? (owner, 2026-10-14)
 *
 * The same rule the profile saves apply to the fields themselves, asked here too
 * because an upload happens BEFORE the save: ADMIN, the НПП themself, or an
 * EDITOR whose division holds STAFF UPDATE **and** the grant for this very
 * certificate (`englishCertificate` / `ukrainianCertificate`) — on a USER record,
 * as `canMutateStaffRecord` says for every editor. Only an НПП has certificates.
 *
 * Reading a scan is a different question (`authoriseQualifications(…, 'read')`:
 * the owner, ADMIN, a division with «Перегляд підвищення кваліфікації»).
 */
export async function authoriseCertificateWrite(
  ownerId: string,
  kind: CertificateKind
): Promise<{ ok: true; userId: string } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session || !userId) return { error: NOT_ALLOWED };

  const owner = await db.staff.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, isNpp: true },
  });
  if (!owner) return { error: 'Працівника не знайдено' };
  if (!owner.isNpp) return { error: NOT_ALLOWED };
  if (!canMutateStaffRecord(session.user, owner)) return { error: NOT_ALLOWED };

  const { role, staffId } = session.user;
  if (role === 'ADMIN' || (staffId && staffId === ownerId)) return { ok: true, userId };

  if (role !== 'EDITOR') return { error: NOT_ALLOWED };
  const divisionId = await getEditorDivisionId(staffId);
  if (!divisionId) return { error: NOT_ALLOWED };
  if (!(await hasEntityPermission(divisionId, 'STAFF', 'UPDATE'))) return { error: NOT_ALLOWED };
  const grants = await getDivisionFieldGrants(divisionId);
  return grants.has(CERTIFICATE_FIELDS[kind]) ? { ok: true, userId } : { error: NOT_ALLOWED };
}
