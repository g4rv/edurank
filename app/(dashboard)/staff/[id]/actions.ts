'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { hash } from 'bcryptjs';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { staffUpdateSchema, type StaffUpdateSchema } from '@/validations/staff';
import {
  setPasswordSchema,
  changeRoleSchema,
  type SetPasswordSchema,
  type ChangeRoleSchema,
} from '@/validations/account';
import { issueActivationToken, ACTIVATION_TOKEN_DAYS } from '@/lib/activation';
import { sendMail } from '@/lib/mail/mailer';
import { inviteEmail, passwordResetEmail } from '@/lib/mail/templates';
import { diffChanges } from '@/lib/audit';
import {
  canManageEntity,
  canMutateStaffRecord,
  getEditorDivisionId,
  getDivisionFieldGrants,
  hasEntityPermission,
  requireAdmin,
  isEditorWritableField,
  isLastActiveAdmin,
  USER_EDITABLE_STAFF_FIELDS,
} from '@/lib/permissions';
import { parseDbError } from '@/lib/db-error';
import { syncProfileDerived, PROFILE_DERIVED_STAFF_FIELDS } from '@/lib/rating/profile-derived';

export type StaffArchiveState = { error: string } | { success: true; message: string };

/**
 * Take a person off the active roster without losing anything they did.
 *
 * There is no hard delete of a person in this app. Deleting a Staff row
 * cascades their activities and rating entries — closed years included — and
 * those numbers are final university records. Archiving covers the two cases
 * that actually happen: someone leaves (and may come back years later, to find
 * their history intact), and someone goes on декретна відпустка, where they must
 * drop out of the current rating while every past result stays.
 *
 * The STAFF DELETE entity permission governs it: same intent — removing a person
 * from the roster — with none of the loss.
 */
export async function archiveStaff(id: string, reason: string): Promise<StaffArchiveState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'STAFF', 'DELETE')))
    return { error: 'Недостатньо прав' };

  // An editor holding STAFF DELETE could otherwise archive an admin — the
  // entity permission says they may take staff off the roster, not whom.
  const target = await db.staff.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      archivedAt: true,
      lastName: true,
      firstName: true,
      patronymic: true,
    },
  });
  if (!target) return { error: 'Запис не знайдено' };
  if (!canMutateStaffRecord(session.user, target, { allowSelf: false })) {
    return { error: 'Недостатньо прав' };
  }
  if (target.archivedAt) return { error: 'Запис вже архівовано' };

  // Archiving blocks the login, so the last admin would lock the university out
  if (await isLastActiveAdmin(id)) {
    return { error: 'Це єдиний активний адміністратор — спочатку призначте іншого' };
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length > 500) return { error: 'Причина занадто довга (до 500 символів)' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const archivedAt = new Date();

      // tokenVersion: an archived account cannot sign in, and any session open
      // right now must end too — otherwise the person keeps working until it
      // expires on its own.
      await tx.staff.update({
        where: { id },
        data: {
          archivedAt,
          archiveReason: trimmedReason || null,
          tokenVersion: { increment: 1 },
        },
      });

      // The rating rows stay untouched on purpose: the person leaves the lists,
      // the history does not move. syncProfileDerived drops their derived rows
      // for the open year, so the current year stops counting them.
      await syncProfileDerived(tx, id);

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: id,
          label: staffFullName(target),
          userId: session.user.id,
          changes: diffChanges(
            { archivedAt: null, archiveReason: null },
            { archivedAt: archivedAt.toISOString(), archiveReason: trimmedReason || null }
          ),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e, 'Помилка при архівуванні');
  }

  if (dbError) return { error: dbError };
  revalidatePath('/staff');
  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Запис архівовано' };
}

/** Back onto the roster: the login works again and the current year counts them */
export async function restoreStaff(id: string): Promise<StaffArchiveState> {
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canManageEntity(session.user, 'STAFF', 'DELETE')))
    return { error: 'Недостатньо прав' };

  const target = await db.staff.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      archivedAt: true,
      archiveReason: true,
      lastName: true,
      firstName: true,
      patronymic: true,
    },
  });
  if (!target) return { error: 'Запис не знайдено' };
  if (!canMutateStaffRecord(session.user, target, { allowSelf: false })) {
    return { error: 'Недостатньо прав' };
  }
  const archivedAt = target.archivedAt;
  if (!archivedAt) return { error: 'Запис не архівовано' };

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id },
        data: { archivedAt: null, archiveReason: null },
      });

      // Refill the derived indicators the archive dropped, so a returning
      // person's стаж, звання and посада count in the open year again.
      await syncProfileDerived(tx, id);

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: id,
          label: staffFullName(target),
          userId: session.user.id,
          changes: diffChanges(
            {
              archivedAt: archivedAt.toISOString(),
              archiveReason: target.archiveReason,
            },
            { archivedAt: null, archiveReason: null }
          ),
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e, 'Помилка при відновленні');
  }

  if (dbError) return { error: dbError };
  revalidatePath('/staff');
  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Запис відновлено' };
}

export type StaffUpdateState = { error: string } | { success: true };

export async function updateStaff(id: string, data: StaffUpdateSchema): Promise<StaffUpdateState> {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';
  const isOwnProfile = role === 'USER' && session.user.staffId === id;

  if (!isAdmin && !isOwnProfile && role !== 'EDITOR') {
    return { error: 'Недостатньо прав' };
  }

  // Which fields an editor may write is decided further down by their grants;
  // whose record they may write is decided here, before anything is parsed.
  const target = await db.staff.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return { error: 'Запис не знайдено' };
  if (!canMutateStaffRecord(session.user, target)) return { error: 'Недостатньо прав' };

  const parsed = staffUpdateSchema.safeParse(data);
  if (!parsed.success) return { error: 'Невірні дані' };

  const { partTimeDepartmentIds, ...fields } = parsed.data;

  let updateData: Record<string, unknown> = {};

  if (isAdmin) {
    updateData = { ...fields };
  } else if (role === 'EDITOR') {
    const divisionId = await getEditorDivisionId(session.user.staffId);
    if (!divisionId) return { error: 'Недостатньо прав' };
    if (!(await hasEntityPermission(divisionId, 'STAFF', 'UPDATE')))
      return { error: 'Недостатньо прав' };

    const allowed = await getDivisionFieldGrants(divisionId);
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.has(key) && isEditorWritableField(key)) updateData[key] = val;
    }
  } else {
    for (const [key, val] of Object.entries(fields)) {
      if (USER_EDITABLE_STAFF_FIELDS.has(key)) updateData[key] = val;
    }
  }

  // An editor whose division holds no usable field grants would otherwise get
  // an empty UPDATE, an empty audit row, and a «Збережено» for nothing saved
  if (Object.keys(updateData).length === 0) {
    return { error: 'Немає полів, доступних для редагування' };
  }

  let dbError: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({
        where: { id },
        select: {
          lastName: true,
          firstName: true,
          patronymic: true,
          email: true,
          phone: true,
          isNpp: true,
          employmentRate: true,
          pedagogicalExperience: true,
          academicRank: true,
          scientificDegree: true,
          degreeMatchesDepartment: true,
          adminPosition: true,
          basicEducationMatch: true,
          basicEducationSpecialty: true,
          wosUrl: true,
          wosCitationCount: true,
          scopusUrl: true,
          scopusCitationCount: true,
          googleScholarUrl: true,
          googleScholarCitationCount: true,
          orcidId: true,
          departmentId: true,
          divisionId: true,
        },
      });

      const beforeFiltered: Record<string, string | number | boolean | null> = {};
      for (const key of Object.keys(updateData)) {
        beforeFiltered[key] = ((existing as Record<string, unknown> | null)?.[key] ?? null) as
          | string
          | number
          | boolean
          | null;
      }
      const changes = diffChanges(
        beforeFiltered,
        updateData as Record<string, string | number | boolean | null>
      );

      await tx.staff.update({ where: { id }, data: updateData });

      // Profile is the source of truth for derived rating indicators — re-sync
      // when any feeding field (or the НПП flag itself) was touched.
      const touchesDerived = Object.keys(updateData).some(
        (key) =>
          key === 'isNpp' || (PROFILE_DERIVED_STAFF_FIELDS as readonly string[]).includes(key)
      );
      if (touchesDerived) await syncProfileDerived(tx, id);

      if (isAdmin) {
        await tx.staffDepartment.deleteMany({ where: { staffId: id } });
        if (partTimeDepartmentIds.length > 0) {
          await tx.staffDepartment.createMany({
            data: partTimeDepartmentIds.map((deptId) => ({ staffId: id, departmentId: deptId })),
            skipDuplicates: true,
          });
        }
      }

      // Re-saving a form without touching anything should not leave a log entry
      // that lists no change. ADMIN still always gets one: they may have edited
      // the part-time departments, which the field diff does not cover.
      if (Object.keys(changes).length === 0 && !isAdmin) return;

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Staff',
          entityId: id,
          label: existing
            ? `${existing.lastName} ${existing.firstName} ${existing.patronymic}`
            : undefined,
          userId: session.user.id,
          changes,
        },
      });
    });
  } catch (e) {
    dbError = parseDbError(e);
  }

  if (dbError) return { error: dbError };
  return { success: true };
}

// ─── Account actions (ADMIN only) ────────────────────────────────────────────

export type AccountActionState = { error: string } | { success: true; message?: string };

function staffFullName(s: { lastName: string; firstName: string; patronymic: string }) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

async function issueAndEmailLink(
  staff: { id: string; email: string; lastName: string; firstName: string; patronymic: string },
  kind: 'invite' | 'reset'
): Promise<void> {
  const token = await issueActivationToken(staff.id);
  const link = `${process.env.APP_URL ?? 'http://localhost:3000'}/activate/${token}`;
  const input = {
    fullName: staffFullName(staff),
    link,
    expiresDays: ACTIVATION_TOKEN_DAYS,
  };
  await sendMail({
    to: staff.email,
    ...(kind === 'invite' ? inviteEmail(input) : passwordResetEmail(input)),
  });
}

// Invite (or re-invite) a not-yet-activated person: new token + email
export async function sendInvite(id: string): Promise<AccountActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const staff = await db.staff.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      passwordHash: true,
    },
  });
  if (!staff) return { error: 'Запис не знайдено' };
  if (staff.passwordHash) return { error: 'Обліковий запис вже активовано' };

  try {
    await issueAndEmailLink(staff, 'invite');
  } catch {
    return { error: 'Не вдалося надіслати лист. Перевірте налаштування пошти' };
  }

  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Запрошення надіслано' };
}

// Reset password: clear the hash (deactivates), kill sessions, email a new link
export async function resetPassword(id: string): Promise<AccountActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const staff = await db.staff.findUnique({
    where: { id },
    select: { id: true, email: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff) return { error: 'Запис не знайдено' };

  // Mail first, deactivate second: the reset clears the password, so doing it
  // before a failed send would leave the person with neither a working
  // password nor a link — and for a lone admin, no way back in at all.
  try {
    await issueAndEmailLink(staff, 'reset');
  } catch {
    return { error: 'Не вдалося надіслати лист. Пароль не скинуто' };
  }

  await db.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: { passwordHash: null, tokenVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'Staff',
        entityId: id,
        label: staffFullName(staff),
        userId: session.user.id,
        changes: { passwordHash: { from: '***', to: null } },
      },
    });
  });

  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Пароль скинуто, лист надіслано' };
}

// Manual fallback for a bounced mailbox: admin sets the password directly
export async function setPasswordManually(
  id: string,
  data: SetPasswordSchema
): Promise<AccountActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  const parsed = setPasswordSchema.safeParse(data);
  if (!parsed.success) return { error: 'Некоректні дані' };

  const staff = await db.staff.findUnique({
    where: { id },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff) return { error: 'Запис не знайдено' };

  const passwordHash = await hash(parsed.data.password, 10);

  await db.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.activationToken.deleteMany({ where: { staffId: id } });
    await tx.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'Staff',
        entityId: id,
        label: staffFullName(staff),
        userId: session.user.id,
        changes: { passwordHash: { from: null, to: '***' } },
      },
    });
  });

  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Пароль встановлено' };
}

// Bump tokenVersion — every live session for this person dies on next request
export async function forceLogout(id: string): Promise<AccountActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  await db.staff.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });

  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Всі сесії завершено' };
}

export async function changeRole(id: string, data: ChangeRoleSchema): Promise<AccountActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (session.user.id === id) return { error: 'Не можна змінити власну роль' };

  const parsed = changeRoleSchema.safeParse(data);
  if (!parsed.success) return { error: 'Некоректні дані' };

  const staff = await db.staff.findUnique({
    where: { id },
    select: { id: true, role: true, lastName: true, firstName: true, patronymic: true },
  });
  if (!staff) return { error: 'Запис не знайдено' };
  if (staff.role === parsed.data.role) return { success: true };

  if (parsed.data.role !== 'ADMIN' && (await isLastActiveAdmin(id))) {
    return { error: 'Це єдиний активний адміністратор — спочатку призначте іншого' };
  }

  await db.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: { role: parsed.data.role, tokenVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'Staff',
        entityId: id,
        label: staffFullName(staff),
        userId: session.user.id,
        changes: { role: { from: staff.role, to: parsed.data.role } },
      },
    });
  });

  revalidatePath(`/staff/${id}`);
  return { success: true, message: 'Роль змінено' };
}
