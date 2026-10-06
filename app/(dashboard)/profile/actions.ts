'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ownProfileSchema, type OwnProfileSchema } from '@/validations/staff';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { logWarning } from '@/lib/log';
import { USER_EDITABLE_STAFF_FIELDS } from '@/lib/permissions';
import {
  ACADEMIC_STORED_SELECT,
  academicAuditValue,
  mirrorsForUpdate,
  storedAcademic,
} from '@/lib/staff/academic';
import { PROFILE_DERIVED_STAFF_FIELDS, syncProfileDerived } from '@/lib/rating/profile-derived';
import type { DiffValue } from '@/lib/audit';

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
 * widening the schema by accident cannot widen what reaches the database.
 *
 * Since 2026-10-06 that includes the person's own academic info, and three of
 * those fields pay rating points through the legacy mirrors
 * (`lib/staff/academic.ts`) — so a save that touches them writes the mirrors
 * and re-scores the profile-derived indicators.
 */
export async function updateOwnProfile(data: OwnProfileSchema): Promise<OwnProfileState> {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (!staffId) return { error: 'Ваш профіль не знайдено' };

  const parsed = ownProfileSchema.safeParse(data);
  if (!parsed.success) {
    // Logged, because «Невірні дані» on its own is unactionable from a support
    // report: it cannot say WHICH field, and the person on the phone cannot
    // read a red line they have already navigated away from. An НПП reported
    // failing to save her number twice while the same edit worked from /staff,
    // and nothing anywhere recorded why (2026-08-31).
    //
    // Field NAMES and messages only — never the values. A profile carries a
    // personal phone number, and a log line is not the place for it.
    logWarning('profile.updateOwnProfile', 'schema rejected the submission', {
      userId: session.user.id,
      fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(','),
      messages: [...new Set(parsed.error.issues.map((i) => i.message))].join(' | '),
    });
    return { error: 'Невірні дані' };
  }

  // Only what was actually SENT. The schema fills every field it knows —
  // an absent badge list becomes [] — and a save from a form that does not
  // carry the academic fields would otherwise wipe them (2026-10-06).
  const sent = new Set(Object.keys((data ?? {}) as object));
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (USER_EDITABLE_STAFF_FIELDS.has(key) && sent.has(key)) updateData[key] = value;
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
          wosCitationCount: true,
          scopusCitationCount: true,
          googleScholarCitationCount: true,
          ...ACADEMIC_STORED_SELECT,
        },
      });

      // Badge lists and degree keys reach the log as words, never as keys.
      const before: Record<string, DiffValue> = {};
      const after: Record<string, DiffValue> = {};
      for (const key of Object.keys(updateData)) {
        const stored = (existing as Record<string, unknown> | null)?.[key] ?? null;
        before[key] = academicAuditValue(key, stored);
        after[key] = academicAuditValue(key, updateData[key]);
      }
      const changes = diffChanges(before, after);

      // The old columns the rating still reads, derived AFTER the diff: they
      // are bookkeeping, not something the person changed.
      const mirrors = mirrorsForUpdate(
        storedAcademic(existing as Record<string, unknown> | null),
        updateData
      );
      if (mirrors) Object.assign(updateData, mirrors);

      await tx.staff.update({ where: { id: staffId }, data: updateData });

      const touchesDerived = Object.keys(updateData).some((key) =>
        (PROFILE_DERIVED_STAFF_FIELDS as readonly string[]).includes(key)
      );
      if (touchesDerived) await syncProfileDerived(tx, staffId);

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
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'profile.updateOwnProfile',
        {
          userId: session.user.id,
        }
      ),
    };
  }

  revalidatePath('/profile');
  return { success: true };
}
