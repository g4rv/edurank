import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { EntityType, EntityAction, Role } from '@/lib/generated/prisma/client';

/**
 * Confidential Staff fields: only ADMIN reads/writes them, EDITOR never,
 * USER sees only their own. Enforced in three places that must stay in sync:
 * - updateStaff write filter
 * - setFieldPermission (cannot be granted to a division)
 * - queries via includeConfidential
 */
export const CONFIDENTIAL_STAFF_FIELDS: ReadonlySet<string> = new Set(['employmentRate']);

/**
 * Account/auth columns on Staff (merged from the former User model).
 * Never grantable to divisions, never client-editable through updateStaff,
 * and passwordHash must never appear in a select that reaches UI.
 */
const AUTH_STAFF_FIELDS: ReadonlySet<string> = new Set(['passwordHash', 'role', 'tokenVersion']);

/**
 * A person's division decides which permissions their EDITOR role carries, so
 * an editor who could write it would escalate at will — grant the field to
 * кадри and any of their editors could move themselves into ННВ and pick up
 * rating moderation. ADMIN only, for the same reason Division CRUD is.
 */
export const PERMISSION_SCOPING_STAFF_FIELDS: ReadonlySet<string> = new Set(['divisionId']);

/**
 * May an EDITOR write this Staff field at all? Applied on top of the
 * division's grants, so a stale or hand-inserted DivisionFieldPermission row
 * still cannot reach a confidential, account, or permission-scoping column.
 */
export function isEditorWritableField(fieldName: string): boolean {
  return (
    !CONFIDENTIAL_STAFF_FIELDS.has(fieldName) &&
    !AUTH_STAFF_FIELDS.has(fieldName) &&
    !PERMISSION_SCOPING_STAFF_FIELDS.has(fieldName)
  );
}

/** Staff fields a USER may edit on their own profile */
export const USER_EDITABLE_STAFF_FIELDS: ReadonlySet<string> = new Set([
  'phone',
  'wosUrl',
  'scopusUrl',
  'googleScholarUrl',
  'orcidId',
]);

/**
 * True when demoting or deleting this person would leave nobody able to sign
 * in as ADMIN. Only activated accounts count: an admin who never set a
 * password cannot log in, and only another admin could invite them — so
 * "one inactive admin remains" is still a locked-out university.
 */
export async function isLastActiveAdmin(staffId: string): Promise<boolean> {
  const staff = await db.staff.findUnique({ where: { id: staffId }, select: { role: true } });
  if (staff?.role !== 'ADMIN') return false;

  const otherAdmins = await db.staff.count({
    where: { id: { not: staffId }, role: 'ADMIN', passwordHash: { not: null } },
  });
  return otherAdmins === 0;
}

export async function getEditorDivisionId(
  staffId: string | null | undefined
): Promise<string | null> {
  if (!staffId) return null;
  const s = await db.staff.findUnique({ where: { id: staffId }, select: { divisionId: true } });
  return s?.divisionId ?? null;
}

export async function hasEntityPermission(
  divisionId: string,
  entity: EntityType,
  action: EntityAction
): Promise<boolean> {
  const perm = await db.divisionEntityPermission.findFirst({
    where: { divisionId, entity, action },
  });
  return !!perm;
}

/**
 * The standard ADMIN/EDITOR ladder for entity CRUD actions:
 * ADMIN — always; EDITOR — if their division holds the entity permission; others — never.
 */
export async function canManageEntity(
  user: { role: Role; staffId?: string | null },
  entity: EntityType,
  action: EntityAction
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR') return false;
  const divisionId = await getEditorDivisionId(user.staffId);
  if (!divisionId) return false;
  return hasEntityPermission(divisionId, entity, action);
}

/**
 * Whose record may this caller mutate?
 *
 * A division's grants decide WHICH fields an editor may write; this decides
 * WHOSE. The two are separate questions and the grants never answered the
 * second one: an editor allowed to write `email` could point an admin's
 * address at their own mailbox, run the public reset flow at /forgot-password,
 * and come back holding the admin's role.
 *
 * ADMIN — anybody. EDITOR — only USER records. Anyone — their own row, which
 * cannot escalate: role, tokenVersion and divisionId stay unwritable for
 * everyone but ADMIN (see isEditorWritableField), so a self-edit reaches
 * nothing but ordinary profile data.
 *
 * Deleting passes `allowSelf: false` — removing yourself is not a self-service
 * action, and an editor deleting their own row only strands the record.
 */
export function canMutateStaffRecord(
  caller: { role: Role; staffId?: string | null },
  target: { id: string; role: Role },
  { allowSelf = true }: { allowSelf?: boolean } = {}
): boolean {
  if (caller.role === 'ADMIN') return true;
  if (allowSelf && caller.staffId && caller.staffId === target.id) return true;
  if (caller.role !== 'EDITOR') return false;
  return target.role === 'USER';
}

/** ADMIN, or an EDITOR belonging to exactly this division (rating direct-entry pages) */
export async function canActForDivision(
  user: { role: Role; staffId?: string | null },
  divisionId: string
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR') return false;
  return (await getEditorDivisionId(user.staffId)) === divisionId;
}

/** Staff field names a division's editors are granted to edit */
export async function getDivisionFieldGrants(divisionId: string): Promise<Set<string>> {
  const permissions = await db.divisionFieldPermission.findMany({
    where: { divisionId },
    select: { fieldName: true },
  });
  return new Set(permissions.map((p) => p.fieldName));
}

/**
 * Guard for ADMIN-only actions: redirects anonymous users to /login,
 * returns null for non-admins (caller returns its own error), the session for admins.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session) redirect('/login');
  return session.user.role === 'ADMIN' ? session : null;
}
