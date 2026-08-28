'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { divisionSchema, type DivisionSchema } from '@/validations/division';
import { diffChanges } from '@/lib/audit';
import { requireAdmin } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';

export type DivisionActionState = { error: string } | { redirectTo: string };

/**
 * See the note in `faculties/actions.ts` — same gap, same cause. A відділ is
 * also a column on both permission screens and the owner of `/division-data`,
 * so a renamed or deleted one went on showing its old name there.
 */
function revalidateDivisions(id?: string) {
  revalidatePath('/divisions');
  if (id) revalidatePath(`/divisions/${id}`);
  revalidatePath('/admin/permissions/field');
  revalidatePath('/admin/permissions/entity');
  revalidatePath('/division-data');
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
          changes: diffChanges(
            {},
            {
              name: parsed.data.name,
              canModerateRating: parsed.data.canModerateRating,
            }
          ),
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

export async function updateDivision(
  id: string,
  data: DivisionSchema
): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = divisionSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.division.findUnique({
        where: { id },
        select: { name: true, canModerateRating: true },
      });
      // Granting or revoking moderation is a permission change — it has to be
      // as visible in the audit log as a rename is.
      const changes = diffChanges(
        {
          name: existing?.name ?? null,
          canModerateRating: existing?.canModerateRating ?? null,
        },
        {
          name: parsed.data.name,
          canModerateRating: parsed.data.canModerateRating,
        }
      );

      await tx.division.update({
        where: { id },
        data: {
          name: parsed.data.name,
          canModerateRating: parsed.data.canModerateRating,
        },
      });
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
      'division.updateDivision',
      {
        userId: session.user.id,
      }
    );
  }

  if (dbError) return { error: dbError };
  revalidateDivisions(id);
  return { redirectTo: `/divisions/${id}` };
}

export async function deleteDivision(id: string): Promise<DivisionActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const division = await db.division.findUnique({
    where: { id },
    select: { name: true, _count: { select: { staff: true } } },
  });

  if (!division) return { error: 'Відділ не знайдено' };
  if (division._count.staff > 0)
    return { error: 'Неможливо видалити відділ, до якого прикріплений персонал' };

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
