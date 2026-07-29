'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ownProfileSchema, type OwnProfileSchema } from '@/validations/staff';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { USER_EDITABLE_STAFF_FIELDS } from '@/lib/permissions';

export type OwnProfileState = { error: string } | { success: true };

/**
 * A person corrects their own contact details and research profile links.
 *
 * Deliberately not updateStaff: that action takes the whole Staff shape and
 * works out what the caller's role may write, which makes it the wrong tool for
 * someone whose only claim is that the record is theirs. An НПП holds no staff
 * permissions at all, and still owns their phone number.
 *
 * The write is filtered through USER_EDITABLE_STAFF_FIELDS after parsing, so
 * widening the schema by accident cannot widen what reaches the database. None
 * of these fields feed a profile-derived indicator — those read counts and
 * titles, not links — so there is nothing to re-sync.
 */
export async function updateOwnProfile(data: OwnProfileSchema): Promise<OwnProfileState> {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (!staffId) return { error: 'Ваш профіль не знайдено' };

  const parsed = ownProfileSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (USER_EDITABLE_STAFF_FIELDS.has(key)) updateData[key] = value;
  }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({
        where: { id: staffId },
        select: {
          lastName: true,
          firstName: true,
          patronymic: true,
          phone: true,
          wosUrl: true,
          scopusUrl: true,
          googleScholarUrl: true,
          orcidId: true,
        },
      });

      const before: Record<string, string | number | boolean | null> = {};
      for (const key of Object.keys(updateData)) {
        before[key] = ((existing as Record<string, unknown> | null)?.[key] ?? null) as
          | string
          | number
          | boolean
          | null;
      }
      const changes = diffChanges(
        before,
        updateData as Record<string, string | number | boolean | null>
      );

      await tx.staff.update({ where: { id: staffId }, data: updateData });

      // Re-saving the form untouched should not leave a log entry listing no change
      if (Object.keys(changes).length === 0) return;

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: staffId,
          label: existing
            ? `${existing.lastName} ${existing.firstName} ${existing.patronymic}`
            : undefined,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    return { error: parseDbError(e) };
  }

  revalidatePath('/profile');
  return { success: true };
}
