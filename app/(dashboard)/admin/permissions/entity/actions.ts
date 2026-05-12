'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { EntityType, EntityAction } from '@/lib/generated/prisma/client';

export type PermissionToggleState = { error: string } | null;

export async function setEntityPermission(
  divisionId: string,
  entity: EntityType,
  action: EntityAction,
  enabled: boolean
): Promise<PermissionToggleState> {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') return { error: 'Недостатньо прав' };

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
  } catch {
    return { error: 'Помилка при збереженні' };
  }

  revalidatePath('/admin/permissions/entity');
  return null;
}
