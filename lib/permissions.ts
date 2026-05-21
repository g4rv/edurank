import { db } from '@/lib/db';
import type { EntityType, EntityAction } from '@/lib/generated/prisma/client';

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
