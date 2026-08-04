'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';
import type { EntityType, EntityAction } from '@/lib/generated/prisma/client';

export type PermissionToggleState = { error: string } | null;

export async function setEntityPermission(
  divisionId: string,
  entity: EntityType,
  action: EntityAction,
  enabled: boolean
): Promise<PermissionToggleState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  try {
    if (enabled) {
      await db.divisionEntityPermission.upsert({
        where: { divisionId_entity_action: { divisionId, entity, action } },
        create: { divisionId, entity, action },
        update: {},
      });
    } else {
      await db.divisionEntityPermission.deleteMany({ where: { divisionId, entity, action } });
    }
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'permissions.setEntityPermission'
      ),
    };
  }

  revalidatePath('/admin/permissions/entity');
  return null;
}
