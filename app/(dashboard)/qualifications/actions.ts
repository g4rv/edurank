'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { parseDbError } from '@/lib/db-error';
import { authoriseQualifications, shortName } from '@/lib/qualifications/guard';
import { isQualificationKeyOf } from '@/lib/science/r2';
import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
import type { VerifiedFile } from '@/lib/science/file-intake';
import { toHundredths, fromHundredths } from '@/lib/stake/units';
import {
  qualificationSchemaFor,
  type QualificationData,
  type QualificationFormValues,
} from '@/validations/qualification';

// «Підвищення кваліфікації / Стажування» — create, edit and delete one record
// (owner, 2026-10-13). The НПП writes their own and ADMIN anybody's; a division
// with `canViewQualifications` only reads (`lib/qualifications/access.ts`). The
// rules are asked here on every call — a hidden button is not a permission.
//
// **The file goes up BEFORE the record is saved**, as it does for науковa
// робота (`app/(dashboard)/science-plan/file-actions.ts`): the browser puts the
// bytes in R2, and the save carries a key this file verifies from the stored
// bytes. Every refusal drops the object, so a failed save leaves nothing behind.

/** A staged upload: the object is already in R2. */
export interface StagedQualificationFile {
  objectKey: string;
  fileName: string;
}

export interface QualificationInput {
  /** Whose record. Always sent explicitly: ADMIN writes for others. */
  staffId: string;
  values: QualificationFormValues;
  /**
   * `undefined` — leave the file as it is (on create: none).
   * `null` — take the file away.
   * an object — a new upload replaces whatever was there.
   */
  file?: StagedQualificationFile | null;
}

type Result = { ok: true; id: string } | { error: string };

function revalidateFor(staffId: string) {
  revalidatePath('/profile/qualifications');
  revalidatePath(`/staff/${staffId}/qualifications`);
}

/** The stored row in the shape the audit log compares. */
function auditValues(row: {
  kind: string;
  institution: string;
  documentType: string;
  series: string | null;
  number: string;
  topic: string;
  issuedOn: Date;
  creditsHundredths: number;
  fileName: string | null;
}) {
  return {
    kind: row.kind,
    institution: row.institution,
    documentType: row.documentType,
    series: row.series,
    number: row.number,
    topic: row.topic,
    issuedOn: row.issuedOn.toISOString().slice(0, 10),
    credits: fromHundredths(row.creditsHundredths),
    fileName: row.fileName,
  };
}

function columnsFrom(data: QualificationData) {
  return {
    kind: data.kind,
    institution: data.institution,
    documentType: data.documentType,
    series: data.series,
    number: data.number,
    topic: data.topic,
    issuedOn: new Date(`${data.issuedOn}T00:00:00.000Z`),
    creditsHundredths: toHundredths(data.credits),
  };
}

function fileColumns(file: VerifiedFile | null) {
  return {
    fileKey: file?.objectKey ?? null,
    fileName: file?.fileName ?? null,
    fileContentType: file?.contentType ?? null,
    fileSizeBytes: file?.sizeBytes ?? null,
    fileSha256: file?.sha256 ?? null,
  };
}

/** The first thing wrong with the values, as one Ukrainian sentence. */
function parseValues(
  values: QualificationFormValues,
  keepDate?: string
): { data: QualificationData } | { error: string } {
  const parsed = qualificationSchemaFor({ keepDate }).safeParse(values);
  if (parsed.success) return { data: parsed.data };
  return { error: parsed.error.issues[0]?.message ?? 'Невірні дані' };
}

/**
 * Verifies a staged upload for THIS person: the key must sit in their own
 * folder (a key is a capability only for whom it was minted), and the stored
 * bytes must be a PDF/JPG/PNG within the limit. A refusal has already dropped
 * the object.
 */
async function verifyStaged(
  staffId: string,
  userId: string,
  staged: StagedQualificationFile,
  scope: string
): Promise<{ file: VerifiedFile } | { error: string }> {
  if (!isQualificationKeyOf(staffId, staged.objectKey)) {
    // Not ours to delete: the key names somebody else's folder, or none.
    return { error: 'Файл не знайдено. Спробуйте завантажити ще раз' };
  }
  const verified = await verifyUploadedObject({
    objectKey: staged.objectKey,
    fileName: staged.fileName,
    scope,
    context: { userId, entityId: staffId },
    allowDuplicate: true,
  });
  if ('error' in verified) return { error: verified.error };
  return { file: verified.file };
}

export async function createQualification(input: QualificationInput): Promise<Result> {
  // A refused caller's staged object is left alone: the key is not theirs to
  // delete, and an orphan costs storage, never a person's data.
  const authorised = await authoriseQualifications(input.staffId, 'write');
  if ('error' in authorised) return { error: authorised.error };
  const { caller } = authorised;

  const parsed = parseValues(input.values);
  if ('error' in parsed) {
    if (input.file) await dropStaged(input.staffId, input.file.objectKey);
    return { error: parsed.error };
  }

  let file: VerifiedFile | null = null;
  if (input.file) {
    const verified = await verifyStaged(
      input.staffId,
      caller.userId,
      input.file,
      'qualifications.createQualification'
    );
    if ('error' in verified) return { error: verified.error };
    file = verified.file;
  }

  try {
    const id = await db.$transaction(async (tx) => {
      const created = await tx.qualification.create({
        data: { staffId: input.staffId, ...columnsFrom(parsed.data), ...fileColumns(file) },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'Qualification',
          entityId: created.id,
          label: `${shortName(caller.owner)} — ${created.topic}`,
          userId: caller.userId,
          changes: diffChanges({}, auditValues(created)),
        },
      });
      return created.id;
    });
    revalidateFor(input.staffId);
    return { ok: true, id };
  } catch (e) {
    // Never leave an object nobody can reference.
    if (file) {
      await safeDeleteObject('qualifications.createQualification', file.objectKey, {
        userId: caller.userId,
        entityId: input.staffId,
      });
    }
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'qualifications.createQualification',
        { userId: caller.userId }
      ),
    };
  }
}

export async function updateQualification(
  id: string,
  input: Omit<QualificationInput, 'staffId'>
): Promise<Result> {
  const existing = await db.qualification.findUnique({ where: { id } });
  if (!existing) {
    // The staged object belongs to nobody we can name; the orphan sweep of a
    // discarded upload is not available without an owner, so it is left.
    return { error: 'Запис не знайдено' };
  }
  const staffId = existing.staffId;

  const authorised = await authoriseQualifications(staffId, 'write');
  if ('error' in authorised) return { error: authorised.error };
  const { caller } = authorised;

  const parsed = parseValues(input.values, existing.issuedOn.toISOString().slice(0, 10));
  if ('error' in parsed) {
    if (input.file) await dropStaged(staffId, input.file.objectKey);
    return { error: parsed.error };
  }

  // Decide what happens to the file before touching the row.
  let nextFile: VerifiedFile | null | undefined; // undefined = keep
  if (input.file === null) {
    nextFile = null;
  } else if (input.file) {
    const verified = await verifyStaged(
      staffId,
      caller.userId,
      input.file,
      'qualifications.updateQualification'
    );
    if ('error' in verified) return { error: verified.error };
    nextFile = verified.file;
  }

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.qualification.update({
        where: { id },
        data: {
          ...columnsFrom(parsed.data),
          ...(nextFile !== undefined ? fileColumns(nextFile) : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Qualification',
          entityId: id,
          label: `${shortName(caller.owner)} — ${updated.topic}`,
          userId: caller.userId,
          changes: diffChanges(auditValues(existing), auditValues(updated)),
        },
      });
    });
  } catch (e) {
    if (nextFile) {
      await safeDeleteObject('qualifications.updateQualification', nextFile.objectKey, {
        userId: caller.userId,
        entityId: id,
      });
    }
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти. Зміни не застосовано',
        'qualifications.updateQualification',
        { userId: caller.userId }
      ),
    };
  }

  // After the commit, never inside it: a save the person saw succeed must not
  // roll back because R2 was slow to delete.
  if (nextFile !== undefined && existing.fileKey && existing.fileKey !== nextFile?.objectKey) {
    await safeDeleteObject('qualifications.updateQualification', existing.fileKey, {
      userId: caller.userId,
      entityId: id,
    });
  }

  revalidateFor(staffId);
  return { ok: true, id };
}

export async function deleteQualification(id: string): Promise<{ ok: true } | { error: string }> {
  const existing = await db.qualification.findUnique({ where: { id } });
  if (!existing) return { error: 'Запис не знайдено' };

  const authorised = await authoriseQualifications(existing.staffId, 'write');
  if ('error' in authorised) return { error: authorised.error };
  const { caller } = authorised;

  try {
    await db.$transaction(async (tx) => {
      await tx.qualification.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'Qualification',
          entityId: id,
          label: `${shortName(caller.owner)} — ${existing.topic}`,
          userId: caller.userId,
          changes: diffChanges(auditValues(existing), {}),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося видалити. Зміни не застосовано',
        'qualifications.deleteQualification',
        { userId: caller.userId }
      ),
    };
  }

  if (existing.fileKey) {
    await safeDeleteObject('qualifications.deleteQualification', existing.fileKey, {
      userId: caller.userId,
      entityId: id,
    });
  }

  revalidateFor(existing.staffId);
  return { ok: true };
}

/** A staged object the save will not use — dropped, but only from its owner's folder. */
async function dropStaged(staffId: string, objectKey: string): Promise<void> {
  if (!isQualificationKeyOf(staffId, objectKey)) return;
  // Nothing references a key until a save succeeds, so there is no row to check
  // — but never touch one a row already holds.
  const held = await db.qualification.findUnique({
    where: { fileKey: objectKey },
    select: { id: true },
  });
  if (!held) await safeDeleteObject('qualifications.dropStaged', objectKey, { entityId: staffId });
}
