'use server';

import { db } from '@/lib/db';
import { logError } from '@/lib/log';
import { authoriseQualifications } from '@/lib/qualifications/guard';
import { fileProblem } from '@/lib/science/file-checks';
import { safeDeleteObject } from '@/lib/science/file-intake';
import {
  isQualificationKeyOf,
  presignGet,
  presignPut,
  qualificationKeyFor,
} from '@/lib/science/r2';

// Scans for «Підвищення кваліфікації / Стажування». The same flow as the
// science evidence files (`app/(dashboard)/science-plan/file-actions.ts`) — the
// browser PUTs straight to R2, the app never sees the bytes — with two
// differences: the key sits in the owner's folder, and there is no
// university-wide «this file is already used» rule (nothing here is claimed
// hours; a person may attach their own scan again).

/** Server-generated key extension — never the name the user typed. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * A presigned PUT for the browser. `staffId` is whose record the file is for —
 * the caller must be allowed to WRITE it, so an НПП can only mint keys in their
 * own folder and ADMIN in anybody's.
 */
export async function presignQualificationUpload(input: {
  staffId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; url: string; objectKey: string } | { error: string }> {
  const authorised = await authoriseQualifications(input.staffId, 'write');
  if ('error' in authorised) return { error: authorised.error };

  const typeFault = fileProblem({ declaredType: input.contentType, sizeBytes: input.sizeBytes });
  if (typeFault) return { error: typeFault };

  const objectKey = qualificationKeyFor({
    staffId: input.staffId,
    ext: EXTENSION_BY_TYPE[input.contentType] ?? 'bin',
  });

  try {
    const url = await presignPut(objectKey, input.contentType);
    return { ok: true, url, objectKey };
  } catch (e) {
    // Every R2 misconfiguration lands here; none of it is the person's doing.
    logError('qualifications.presignUpload', e, { userId: authorised.caller.userId });
    return { error: 'Не вдалося підготувати завантаження файлу' };
  }
}

/**
 * Throw away an upload nobody ended up pointing at. Fire-and-forget from the
 * browser; it never touches an object a record holds, and never one outside the
 * caller's right to write that person's folder.
 */
export async function discardQualificationUpload(
  staffId: string,
  objectKey: string
): Promise<{ ok: true }> {
  const authorised = await authoriseQualifications(staffId, 'write');
  if ('error' in authorised) return { ok: true };
  if (!isQualificationKeyOf(staffId, objectKey)) return { ok: true };

  const held = await db.qualification.findUnique({
    where: { fileKey: objectKey },
    select: { id: true },
  });
  if (!held) {
    await safeDeleteObject('qualifications.discardUpload', objectKey, {
      userId: authorised.caller.userId,
    });
  }
  return { ok: true };
}

/**
 * A short-lived signed GET (5 minutes) — no object is ever public. Whoever may
 * READ the record may open its file: the НПП, ADMIN, and a division with
 * «Перегляд підвищення кваліфікації».
 */
export async function qualificationFileUrl(
  qualificationId: string
): Promise<{ ok: true; url: string } | { error: string }> {
  const row = await db.qualification.findUnique({
    where: { id: qualificationId },
    select: { staffId: true, fileKey: true },
  });
  if (!row) return { error: 'Запис не знайдено' };

  const authorised = await authoriseQualifications(row.staffId, 'read');
  if ('error' in authorised) return { error: 'У вас немає доступу до цього файлу' };
  if (!row.fileKey) return { error: 'До цього запису файл не додано' };

  try {
    return { ok: true, url: await presignGet(row.fileKey) };
  } catch (e) {
    logError('qualifications.fileUrl', e, { userId: authorised.caller.userId });
    return { error: 'Не вдалося отримати посилання на файл' };
  }
}
