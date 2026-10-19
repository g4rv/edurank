'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  divisionSchema,
  divisionSettingsSchema,
  type DivisionSchema,
  type DivisionSettingsSchema,
} from '@/validations/division';
import { diffChanges } from '@/lib/audit';
import { requireAdmin, isEditorWritableField } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';
import { ALLOWED_FIELD_NAMES } from '@/lib/divisions/field-grants';
import { describeEntities, describeFields } from '@/lib/divisions/settings';

/** Every on/off grant a відділ carries; each one is audited when it moves. */
const SWITCHES = [
  'canModerateRating',
  'canOverseeScience',
  'canViewQualifications',
  'canInviteStaff',
  'canSetPasswords',
  'canEndSessions',
] as const;

function switchesOf(
  source: Partial<Record<(typeof SWITCHES)[number], boolean | null | undefined>>
) {
  return Object.fromEntries(SWITCHES.map((k) => [k, source[k] ?? null])) as Record<
    (typeof SWITCHES)[number],
    boolean | null
  >;
}

export type DivisionActionState = { error: string } | { redirectTo: string };

/**
 * See the note in `faculties/actions.ts` — same gap, same cause. A відділ is
 * also the owner of `/division-data`,
 * so a renamed or deleted one went on showing its old name there.
 */
function revalidateDivisions(id?: string) {
  revalidatePath('/divisions');
  if (id) revalidatePath(`/divisions/${id}`);
  revalidatePath('/division-data');
  // «Перевірка науки» decides who reaches both of these.
  revalidatePath('/science-plans');
  revalidatePath('/moderation');
}

export async function createDivision(data: DivisionSchema): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = divisionSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.division.create({
        data: {
          name: parsed.data.name,
          canModerateRating: parsed.data.canModerateRating,
          canOverseeScience: parsed.data.canOverseeScience,
          canViewQualifications: parsed.data.canViewQualifications,
          canInviteStaff: parsed.data.canInviteStaff,
          canSetPasswords: parsed.data.canSetPasswords,
          canEndSessions: parsed.data.canEndSessions,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Division',
          entityId: created.id,
          label: parsed.data.name,
          userId: session.user.id,
          changes: diffChanges({}, { name: parsed.data.name, ...switchesOf(parsed.data) }),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(
      e,
      'Не вдалося зберегти. Зміни не застосовано',
      'division.createDivision',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  revalidateDivisions();
  return { redirectTo: '/divisions' };
}

export async function updateDivisionSettings(
  id: string,
  data: DivisionSettingsSchema
): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = divisionSettingsSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  // Whole-save refusal: one bad name anywhere and nothing is written. Neither
  // the form nor a hand-made request may grant a confidential, account or
  // permission-scoping field, however the allowed list drifts.
  const fields = [...new Set(parsed.data.fieldPermissions)];
  if (fields.some((f) => !isEditorWritableField(f) || !ALLOWED_FIELD_NAMES.has(f))) {
    return { error: 'Невідоме поле' };
  }
  const entities = [...new Set(parsed.data.entityPermissions)];

  let dbError: string | null = null;
  let missing = false;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.division.findUnique({
        where: { id },
        select: {
          name: true,
          canModerateRating: true,
          canOverseeScience: true,
          canViewQualifications: true,
          canInviteStaff: true,
          canSetPasswords: true,
          canEndSessions: true,
          entityPermissions: { select: { entity: true, action: true } },
          fieldPermissions: { select: { fieldName: true } },
        },
      });
      if (!existing) {
        missing = true;
        return;
      }

      // One audit entry for the whole save. `diffChanges` compares primitives,
      // so each set becomes one readable string.
      const changes = diffChanges(
        {
          ...switchesOf(existing),
          name: existing.name,
          entityPermissions:
            describeEntities(existing.entityPermissions.map((p) => `${p.entity}:${p.action}`)) ||
            null,
          fieldPermissions:
            describeFields(existing.fieldPermissions.map((p) => p.fieldName)) || null,
        },
        {
          ...switchesOf(parsed.data),
          name: parsed.data.name,
          entityPermissions: describeEntities(entities) || null,
          fieldPermissions: describeFields(fields) || null,
        }
      );

      await tx.division.update({
        where: { id },
        data: {
          name: parsed.data.name,
          canModerateRating: parsed.data.canModerateRating,
          canOverseeScience: parsed.data.canOverseeScience,
          canViewQualifications: parsed.data.canViewQualifications,
          canInviteStaff: parsed.data.canInviteStaff,
          canSetPasswords: parsed.data.canSetPasswords,
          canEndSessions: parsed.data.canEndSessions,
        },
      });

      // Replace, never diff: delete the division's rows and write the submitted
      // ones. Clearing is delete-all with nothing created — no «NOT IN []» case.
      await tx.divisionEntityPermission.deleteMany({ where: { divisionId: id } });
      if (entities.length > 0) {
        await tx.divisionEntityPermission.createMany({
          data: entities.map((key) => {
            const [entity, action] = key.split(':') as [
              'STAFF' | 'DEPARTMENT' | 'FACULTY',
              'CREATE' | 'UPDATE' | 'DELETE',
            ];
            return { divisionId: id, entity, action };
          }),
        });
      }
      await tx.divisionFieldPermission.deleteMany({ where: { divisionId: id } });
      if (fields.length > 0) {
        await tx.divisionFieldPermission.createMany({
          data: fields.map((fieldName) => ({ divisionId: id, fieldName })),
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Division',
          entityId: id,
          label: parsed.data.name,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(
      e,
      'Не вдалося зберегти. Зміни не застосовано',
      'division.updateDivisionSettings',
      { userId: session.user.id }
    );
  }

  if (missing) return { error: 'Відділ не знайдено' };
  if (dbError) return { error: dbError };
  revalidateDivisions(id);
  return { redirectTo: `/divisions/${id}` };
}

export async function deleteDivision(id: string): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const division = await db.division.findUnique({
    where: { id },
    // Same rule as `deleteDepartment`: an archived person is already off
    // every current list, so they must not be the reason a відділ cannot be
    // deleted either.
    select: { name: true, _count: { select: { staff: { where: { archivedAt: null } } } } },
  });

  if (!division) return { error: 'Відділ не знайдено' };
  if (division._count.staff > 0)
    return { error: 'Неможливо видалити відділ, до якого прикріплені працівники' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.division.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Division',
          entityId: id,
          label: division.name,
          userId: session.user.id,
          changes: diffChanges({ name: division.name }, {}),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(
      e,
      'Не вдалося видалити. Зміни не застосовано',
      'division.deleteDivision',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  revalidateDivisions();
  return { redirectTo: '/divisions' };
}
