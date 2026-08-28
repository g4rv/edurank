'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { staffCreateSchema, type StaffCreateSchema } from '@/validations/staff';
import { diffChanges } from '@/lib/audit';
import { canManageEntity, isEditorWritableField } from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';
import { logWarning } from '@/lib/log';
import { issueAndEmailLink } from '@/lib/mail/invite';
import { syncProfileDerived } from '@/lib/rating/profile-derived';

export type StaffCreateState =
  | { error: string }
  /**
   * `inviteWarning` means the person WAS created and only the mail failed. The
   * two must stay separable: losing a filled-in record because SMTP was down
   * would be the worse failure by far, and the invite can be resent from the
   * person's own page at any time.
   */
  | { redirectTo: string; inviteWarning?: string };

export async function createStaff(
  data: StaffCreateSchema,
  options?: { sendInvite?: boolean }
): Promise<StaffCreateState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'STAFF', 'CREATE')))
    return { error: 'Недостатньо прав' };

  const parsed = staffCreateSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const { partTimeDepartmentIds, departmentId, divisionId, ...rest } = parsed.data;

  const createData: Record<string, unknown> = {
    ...rest,
    departmentId: departmentId ?? null,
    divisionId: divisionId ?? null,
  };

  // STAFF CREATE authorises the record and its ordinary data — not the columns
  // that are never an editor's to write. Ставка is confidential and відділ
  // decides an editor's own permission scope, so both are ADMIN-only in
  // updateStaff; leaving them open here would make creating a person the way
  // around that filter. The per-division field grants deliberately do NOT apply:
  // they govern editing an existing row, and enforcing them at creation would
  // stop an editor from filling in a name they are allowed to create.
  if (session.user.role !== 'ADMIN') {
    for (const key of Object.keys(createData)) {
      if (!isEditorWritableField(key)) delete createData[key];
    }
  }

  let createdId = '';
  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.staff.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: createData as any,
        select: { id: true },
      });
      createdId = created.id;

      if (partTimeDepartmentIds.length > 0) {
        await tx.staffDepartment.createMany({
          data: partTimeDepartmentIds.map((deptId) => ({
            staffId: created.id,
            departmentId: deptId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Staff',
          entityId: created.id,
          label: `${rest.lastName} ${rest.firstName} ${rest.patronymic}`,
          userId: session.user.id,
          changes: diffChanges({}, createData as Record<string, string | number | boolean | null>),
        },
      });

      await syncProfileDerived(tx, created.id);
    });
  } catch (e) {
    dbError = parseDbError(e, 'Не вдалося зберегти. Зміни не застосовано', 'staff.createStaff', {
      userId: session.user.id,
    });
  }

  if (dbError) return { error: dbError };

  // See the note in `faculties/actions.ts` — same gap, same cause. Placed
  // before the invite block so BOTH return paths below get it: the record
  // exists either way, and a failed letter must not also cost a stale list.
  //
  // Every кафедра they were placed on, primary and additional: a new colleague
  // shows up on the кафедра page, in «Моя кафедра» and in that кафедра's ставка
  // grid, not only in `/staff`.
  revalidatePath('/staff');
  revalidatePath('/dashboard');
  revalidatePath('/my-department');
  for (const deptId of new Set([departmentId, ...partTimeDepartmentIds].filter(Boolean))) {
    revalidatePath(`/departments/${deptId}`);
    revalidatePath(`/stakes/${deptId}`);
  }

  // Invite immediately, if asked. Deliberately after the transaction and
  // outside it: mail is not rollback-able, and holding a DB transaction open
  // across an SMTP round-trip is how a slow mail server becomes a lock.
  //
  // ADMIN only, matching `sendInvite` on the person's own page — an editor may
  // create a record but has never been able to hand out an account, and the
  // checkbox is hidden from them for the same reason.
  if (options?.sendInvite && session.user.role === 'ADMIN') {
    try {
      await issueAndEmailLink(
        {
          id: createdId,
          email: parsed.data.email,
          lastName: parsed.data.lastName,
          firstName: parsed.data.firstName,
          patronymic: parsed.data.patronymic,
        },
        'invite'
      );
    } catch (e) {
      logWarning('staff.createStaff', 'Не вдалося надіслати запрошення', {
        userId: session.user.id,
        entityId: createdId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        redirectTo: `/staff/${createdId}`,
        inviteWarning: 'Запис створено, але лист не надіслано. Надішліть запрошення ще раз',
      };
    }
  }

  return { redirectTo: `/staff/${createdId}` };
}
