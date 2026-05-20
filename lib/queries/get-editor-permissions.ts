import { db } from '@/lib/db';
import type { EntityType } from '@/lib/generated/prisma/client';

export type EntityPermissions = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export async function getEditorEntityPermissions(
  staffId: string,
  entity: EntityType
): Promise<EntityPermissions> {
  const editorStaff = await db.staff.findUnique({
    where: { id: staffId },
    select: { divisionId: true },
  });

  if (!editorStaff?.divisionId) {
    return { canCreate: false, canUpdate: false, canDelete: false };
  }

  const perms = await db.divisionEntityPermission.findMany({
    where: { divisionId: editorStaff.divisionId, entity },
    select: { action: true },
  });

  const actions = new Set(perms.map((p) => p.action));
  return {
    canCreate: actions.has('CREATE'),
    canUpdate: actions.has('UPDATE'),
    canDelete: actions.has('DELETE'),
  };
}
