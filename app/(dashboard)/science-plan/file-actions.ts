'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { isUniqueViolation, parseDbError } from '@/lib/db-error';
import { logError } from '@/lib/log';
import { canOverseeScience } from '@/lib/science/oversight';
import { objectKeyFor, presignGet, presignPut } from '@/lib/science/r2';
import { fileProblem } from '@/lib/science/file-checks';
import { evidenceProblem, FILE_NOT_ALLOWED } from '@/lib/science/evidence-rule';
import {
  DUPLICATE_FILE_MESSAGE,
  isDuplicateFileViolation,
  safeDeleteObject,
  verifyUploadedObject,
} from '@/lib/science/file-intake';
import { resolveActor } from './record-actions';

// Evidence files for наукова робота records. Read
// `docs/superpowers/specs/2026-09-15-science-plan-design.md` D27 (link or
// file) and D28 (a file is unique across the whole university, never per
// person or per кафедра) before changing anything here.
//
// **The order is upload FIRST, save second.** `presignUpload` needs no record
// and no work — it hands out a key built from the навчальний рік alone — so
// the browser can put the bytes in R2 while the person is still filling the
// form, and `saveRecord` receives an object it can verify and attach in the
// same transaction that creates the work. Two things fall out of that order
// and neither was true before it:
//
//   * a record proved ONLY by a file can exist (D27), which is what half the
//     catalogue's «Форма звітності» column actually asks for;
//   * a failed upload costs an orphaned object, not a saved record that can
//     never be proved.
//
// `attachFile` is the same flow for a record that already exists, so a file
// found in an inbox three months later still has somewhere to go.

/** Server-generated key extension — never the name the user typed. Falls back
 *  to `bin` only in theory: `fileProblem` already refuses anything outside
 *  `ALLOWED_FILE_TYPES` before this is read. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Does this caller have a claim on this work — created it, or drew (still
 *  APPROVED) hours from it? A REMOVED draw holds nothing, the same rule
 *  `findConflict` applies when deciding «has this person already claimed this
 *  work», so every caller below selects `records` scoped to `APPROVED`. */
function ownsWork(work: { createdById: string; records: { staffId: string }[] }, staffId: string) {
  return work.createdById === staffId || work.records.some((r) => r.staffId === staffId);
}

/**
 * D46: who may delete or replace ONE file — ADMIN, whoever entered the work,
 * or whoever uploaded this file. A co-author may take back their own scan,
 * never a file another author's claim rests on — which is why this is still
 * narrower than `ownsWork`.
 */
function mayChangeFile(
  file: { uploadedById: string; work: { createdById: string } },
  staffId: string,
  isAdmin: boolean
): boolean {
  return isAdmin || file.work.createdById === staffId || file.uploadedById === staffId;
}

const CHANGE_FILE_REFUSED = 'Змінити файл може той, хто його додав, або автор роботи';

/**
 * A presigned PUT for the browser to upload straight to R2 — the app never
 * sees the bytes at this step, only issues the URL. Expires in 5 minutes
 * (`lib/science/r2.ts`).
 *
 * **Takes no work and no record.** See the note at the top of this file: the
 * object exists before anything points at it, and `saveRecord` or
 * `attachFile` is what binds it. An object nobody ever binds is an orphan in
 * the bucket — the deliberate price of being able to prove a record by a file
 * at all.
 *
 * **The browser's `sha256` is a courtesy**, letting D28 refuse a duplicate in
 * a round trip instead of after a 5 MB PUT. `verifyUploadedObject` re-hashes
 * the stored bytes and that hash is the one that decides.
 */
export async function presignUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ ok: true; url: string; objectKey: string } | { error: string }> {
  const actor = await resolveActor();
  if (!actor.ok) return { error: actor.error };
  const { userId, template } = actor.context;

  const typeFault = fileProblem({ declaredType: input.contentType, sizeBytes: input.sizeBytes });
  if (typeFault) return { error: typeFault };

  // Before spending the upload (D28): the same bytes, anywhere in the
  // university, at most once.
  const duplicate = await db.scienceRecordFile.findUnique({
    where: { sha256: input.sha256 },
    select: { id: true },
  });
  if (duplicate) return { error: DUPLICATE_FILE_MESSAGE };

  const ext = EXTENSION_BY_TYPE[input.contentType] ?? 'bin';
  const objectKey = objectKeyFor({ templateId: template.id, ext });

  try {
    const url = await presignPut(objectKey, input.contentType);
    return { ok: true, url, objectKey };
  } catch (e) {
    // Every R2 misconfiguration lands here — missing credentials, the wrong
    // jurisdiction host, a bucket that does not exist. None of it is the
    // person's doing, and none of it may escape as an unhandled exception.
    logError('science.presignUpload', e, { userId });
    return { error: 'Не вдалося підготувати завантаження файлу' };
  }
}

/**
 * Throw away an object nobody ended up pointing at — the person replaced their
 * choice, or closed the dialog without saving.
 *
 * **It refuses to touch an object a row references.** The key alone is not
 * authority to delete: without that check, anybody who learned a key could
 * remove the evidence behind somebody else's record. An UNREFERENCED object is
 * nobody's evidence by definition, so the worst a bad caller achieves is
 * deleting a staged upload that was already going to be swept.
 *
 * Fire-and-forget from the browser: a failure here costs storage, never the
 * person's work, so nothing waits on it and nothing is shown.
 */
export async function discardUpload(objectKey: string): Promise<{ ok: true }> {
  const actor = await resolveActor();
  if (!actor.ok) return { ok: true };

  const referenced = await db.scienceRecordFile.findUnique({
    where: { objectKey },
    select: { id: true },
  });
  if (!referenced) {
    await safeDeleteObject('science.discardUpload', objectKey, { userId: actor.context.userId });
  }
  return { ok: true };
}

/**
 * Attach an already-uploaded object to a work that EXISTS — the late half of
 * the same flow `saveRecord` runs inline.
 *
 * This is what makes a file recoverable at all: before it, the only window to
 * add one was the few seconds after «Додати», and an upload that failed there
 * (or a certificate that only arrived in March) could never be attached to
 * that record again.
 */
export async function attachFile(input: {
  workId: string;
  objectKey: string;
  fileName: string;
}): Promise<{ ok: true; fileId: string } | { error: string }> {
  const actor = await resolveActor();
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;

  const work = await db.scienceWork.findUnique({
    where: { id: input.workId },
    select: {
      id: true,
      templateId: true,
      createdById: true,
      records: { where: { status: 'APPROVED' }, select: { staffId: true } },
      workType: { select: { fileRule: true } },
    },
  });
  // A work from another year, or one the caller neither created nor drew
  // hours from, reads the same as «not found» — this is not the place to
  // tell the two apart (spec, «Correcting a work»).
  if (!work || work.templateId !== template.id || !ownsWork(work, staffId)) {
    await safeDeleteObject('science.attachFile', input.objectKey, { userId });
    return { error: 'Роботу не знайдено' };
  }
  // D47: this вид роботи is proved by a link alone.
  if (work.workType.fileRule === 'NONE') {
    await safeDeleteObject('science.attachFile', input.objectKey, { userId });
    return { error: FILE_NOT_ALLOWED };
  }

  const verified = await verifyUploadedObject({
    objectKey: input.objectKey,
    fileName: input.fileName,
    scope: 'science.attachFile',
    context: { userId, entityId: work.id },
  });
  if ('error' in verified) return { error: verified.error };

  try {
    const fileId = await db.$transaction(async (tx) => {
      const file = await tx.scienceRecordFile.create({
        data: { ...verified.file, workId: work.id, uploadedById: staffId },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ScienceRecordFile',
          entityId: file.id,
          label: verified.file.fileName,
          userId,
          changes: diffChanges(
            {},
            { fileName: verified.file.fileName, pageCount: verified.file.pageCount }
          ),
        },
      });

      return file.id;
    });

    revalidatePath('/science-plan');
    return { ok: true, fileId };
  } catch (e) {
    // Never leave the object standing on a refusal — one nobody can reference
    // is pure cost.
    await safeDeleteObject('science.attachFile', input.objectKey, { userId, entityId: work.id });

    if (isUniqueViolation(e) && isDuplicateFileViolation(e)) {
      return { error: DUPLICATE_FILE_MESSAGE };
    }
    return {
      error: parseDbError(
        e,
        'Не вдалося зберегти файл. Зміни не застосовано',
        'science.attachFile',
        {
          userId,
        }
      ),
    };
  }
}

/**
 * A short-lived signed GET (5 minutes) — no object is ever public.
 *
 * **Not gated through `resolveActor`.** That helper also demands `isNpp` and
 * an OPEN template, which is right for planning and recording one's own
 * наукова робота but wrong here: an ADMIN account or an ННВ division editor
 * reading somebody else's evidence is very often NOT an НПП themselves, and
 * reading a file must not depend on this year's template being open at all.
 * So this checks only a session, then the three-way entitlement the spec asks
 * for — the file's work has a record of the caller's own, or the caller is
 * ADMIN, or the caller's division holds «Перевірка науки» (`canOverseeScience`).
 */
export async function fileUrl(
  fileId: string
): Promise<{ ok: true; url: string } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session || !userId) return { error: 'Недостатньо прав' };

  const file = await db.scienceRecordFile.findUnique({
    where: { id: fileId },
    select: {
      objectKey: true,
      work: {
        select: {
          createdById: true,
          records: { where: { status: 'APPROVED' }, select: { staffId: true } },
        },
      },
    },
  });
  if (!file) return { error: 'Файл не знайдено' };

  const staffId = session.user.staffId;
  let entitled = !!staffId && ownsWork(file.work, staffId);

  if (!entitled) entitled = await canOverseeScience(session.user);

  if (!entitled) return { error: 'У вас немає доступу до цього файлу' };

  try {
    const url = await presignGet(file.objectKey);
    return { ok: true, url };
  } catch (e) {
    logError('science.fileUrl', e, { userId });
    return { error: 'Не вдалося отримати посилання на файл' };
  }
}

/**
 * Removes the row and the object.
 *
 * **Creator, uploader or ADMIN — deliberately narrower than `ownsWork`**
 * (`mayChangeFile`). A co-author who merely joined a shared work for a small
 * hours draw must not be able to delete the one evidence file every other
 * co-author's — possibly much larger — claim depends on; their OWN upload is
 * theirs to take back (D46).
 *
 * **Never the only proof.** That file is swapped with `replaceFile` instead,
 * so the record is never, even briefly, proved by nothing.
 *
 * **The DB row goes first, the object after.** A failed object delete is
 * `logWarning`, never a blocked user.
 */
export async function deleteFile(fileId: string): Promise<{ ok: true } | { error: string }> {
  // `allowAdmin`: the ADMIN branch below is the spec's escape hatch, and most
  // ADMIN accounts are not НПП — without this it was unreachable for them.
  const actor = await resolveActor(undefined, { allowAdmin: true });
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;
  const isAdmin = actor.context.role === 'ADMIN';

  const file = await db.scienceRecordFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      uploadedById: true,
      work: {
        select: {
          templateId: true,
          createdById: true,
          link: true,
          workType: { select: { linkRule: true, fileRule: true } },
          _count: { select: { files: true } },
        },
      },
    },
  });
  if (!file || file.work.templateId !== template.id) return { error: 'Файл не знайдено' };
  if (!mayChangeFile(file, staffId, isAdmin)) return { error: CHANGE_FILE_REFUSED };

  // **D27 survives a delete too.** Now that a record can be proved by a file
  // ALONE, removing the last one is the one way left to end up with a record
  // that proves nothing — the exact state `saveRecord` and
  // `updateWorkEvidence` both refuse to create. Measured against what would
  // REMAIN; the way out for the only proof is «Замінити» (`replaceFile`),
  // which the refusal names.
  const fault = evidenceProblem({
    linkRule: file.work.workType.linkRule,
    fileRule: file.work.workType.fileRule,
    link: file.work.link,
    fileCount: file.work._count.files - 1,
  });
  if (fault) {
    return { error: `${fault}: це єдине підтвердження цього запису — скористайтеся «Замінити»` };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.scienceRecordFile.delete({ where: { id: fileId } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'ScienceRecordFile',
          entityId: fileId,
          label: file.fileName,
          userId,
          changes: diffChanges({ fileName: file.fileName }, {}),
        },
      });
    });
  } catch (e) {
    return {
      error: parseDbError(
        e,
        'Не вдалося видалити файл. Зміни не застосовано',
        'science.deleteFile',
        {
          userId,
        }
      ),
    };
  }

  await safeDeleteObject('science.deleteFile', file.objectKey, { userId, entityId: fileId });

  revalidatePath('/science-plan');
  return { ok: true };
}

/**
 * «Замінити» — the new file in, the old one out, in ONE step (D46, owner
 * 2026-09-23).
 *
 * `deleteFile` refuses to remove the only proof of a record, so a bad scan
 * that is the only proof could not be changed at all without this. The order
 * is the owner's rule: the old file goes only once the new one is in. Both
 * rows move in one transaction; the old OBJECT is dropped after the commit.
 * On any refusal or failure the NEW object is dropped (verification drops it
 * itself) and the old file is left exactly as it was.
 *
 * A replacement never changes how many files the work has, so D27's «link or
 * file» holds by construction and is not re-checked.
 */
export async function replaceFile(input: {
  fileId: string;
  objectKey: string;
  fileName: string;
}): Promise<{ ok: true; fileId: string } | { error: string }> {
  const actor = await resolveActor(undefined, { allowAdmin: true });
  if (!actor.ok) return { error: actor.error };
  const { userId, staffId, template } = actor.context;
  const isAdmin = actor.context.role === 'ADMIN';

  const dropNew = () =>
    safeDeleteObject('science.replaceFile', input.objectKey, { userId, entityId: input.fileId });

  const old = await db.scienceRecordFile.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      uploadedById: true,
      work: {
        select: {
          id: true,
          templateId: true,
          createdById: true,
          workType: { select: { fileRule: true } },
        },
      },
    },
  });
  if (!old || old.work.templateId !== template.id) {
    await dropNew();
    return { error: 'Файл не знайдено' };
  }
  if (!mayChangeFile(old, staffId, isAdmin)) {
    await dropNew();
    return { error: CHANGE_FILE_REFUSED };
  }
  // A type that takes no file (D47) but still carries one from before: the
  // way out is deleting it once a link is there, never putting in another.
  if (old.work.workType.fileRule === 'NONE') {
    await dropNew();
    return { error: FILE_NOT_ALLOWED };
  }

  const verified = await verifyUploadedObject({
    objectKey: input.objectKey,
    fileName: input.fileName,
    scope: 'science.replaceFile',
    context: { userId, entityId: old.work.id },
  });
  if ('error' in verified) return { error: verified.error };

  let fileId: string;
  try {
    fileId = await db.$transaction(async (tx) => {
      const created = await tx.scienceRecordFile.create({
        data: { ...verified.file, workId: old.work.id, uploadedById: staffId },
        select: { id: true },
      });
      await tx.scienceRecordFile.delete({ where: { id: old.id } });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'ScienceRecordFile',
          entityId: created.id,
          label: verified.file.fileName,
          userId,
          changes: diffChanges(
            { fileName: old.fileName },
            { fileName: verified.file.fileName, pageCount: verified.file.pageCount }
          ),
        },
      });
      return created.id;
    });
  } catch (e) {
    await dropNew();
    if (isUniqueViolation(e) && isDuplicateFileViolation(e)) {
      return { error: DUPLICATE_FILE_MESSAGE };
    }
    return {
      error: parseDbError(
        e,
        'Не вдалося замінити файл. Старий файл залишився без змін',
        'science.replaceFile',
        { userId }
      ),
    };
  }

  // After the commit, never inside it: a swap the person saw succeed must not
  // roll back because R2 was slow to delete.
  await safeDeleteObject('science.replaceFile', old.objectKey, { userId, entityId: old.id });

  revalidatePath('/science-plan');
  return { ok: true, fileId };
}
