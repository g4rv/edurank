import { db } from '@/lib/db';
import { logWarning, type LogContext } from '@/lib/log';
import { deleteObject, getObjectBytes, headObject } from '@/lib/science/r2';
import { fileProblem, pdfPageCount, sha256Hex, sniffType } from '@/lib/science/file-checks';
import { fileShareProblem, type LinkedWork } from '@/lib/science/file-share';

/**
 * Turning an object somebody PUT into R2 into a row we are willing to store —
 * the half of the file flow that trusts nothing the browser said.
 *
 * **Why this is a module and not a function inside `file-actions.ts`.** Two
 * paths reach it now: `saveRecord`, which uploads the file BEFORE the record
 * exists (D27 — a сертифікат with no public page is the only proof its owner
 * has, so «файл без посилання» has to be savable), and `attachFile`, which
 * adds one to a record already on screen. A `'use server'` file may only
 * export async server actions, so a helper both of them import cannot live in
 * one. §11 of `docs/aurora.md` applied one level down: the second caller is
 * what moves it.
 *
 * Everything here re-derives from the STORED BYTES. The browser's declared
 * type, size and hash are a convenience that saves a wasted upload; they are
 * never evidence.
 */

/** What the checks agreed the object actually is — the shape a
 *  `ScienceRecordFile` row is written from. */
export interface VerifiedFile {
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Pages counted from the stored PDF; null for an image. */
  pageCount: number | null;
  sha256: string;
}

/** D28's refusal names nothing about the other record — whoever holds it may
 *  be on another кафедра entirely, and a refusal is not a place to leak that.
 *  Shared by the pre-check before an upload and by the two places the same
 *  unique index can decide after one. */
export const DUPLICATE_FILE_MESSAGE = 'Цей файл уже використано в іншому записі';

/** A name long enough to break a table cell is a name nobody typed on
 *  purpose. Kept as text, never as part of a key — the R2 object is named by
 *  the server alone. */
const MAX_FILE_NAME = 200;

export function cleanFileName(raw: string): string {
  const trimmed = raw.trim().replace(/[\r\n\t]+/g, ' ');
  return (trimmed.length > MAX_FILE_NAME ? trimmed.slice(0, MAX_FILE_NAME) : trimmed) || 'файл';
}

/**
 * Best-effort cleanup — a failed object delete is `logWarning`, never a
 * blocked user (owner: «an orphan object costs storage, a blocked delete
 * costs somebody their afternoon»).
 */
export async function safeDeleteObject(
  scope: string,
  objectKey: string,
  context: LogContext
): Promise<void> {
  try {
    await deleteObject(objectKey);
  } catch (e) {
    logWarning(scope, 'Не вдалося видалити об’єкт із R2', {
      ...context,
      objectKey,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * HEAD it, size- and type-check what R2 actually stored, download it once,
 * sniff its magic bytes, re-hash it, count its pages.
 *
 * **Every refusal deletes the object**, because an object no row can ever
 * reference is pure cost. The one exception is «not found»: there is nothing
 * to delete, and the person is told to upload again.
 *
 * Returns a Ukrainian sentence on refusal — the caller shows it and adds
 * nothing.
 */
export async function verifyUploadedObject(input: {
  objectKey: string;
  fileName: string;
  /** Log scope of the ACTION that called this, so a report names the
   *  operation somebody complained about rather than this helper. */
  scope: string;
  context: LogContext;
  /**
   * Skip D28's «this file is already used» check. Science evidence is claimed
   * hours, so one file may back one work university-wide; a qualification scan
   * is nobody else's claim, and a person must be able to attach their own scan
   * again. Default false — science callers are unchanged.
   */
  allowDuplicate?: boolean;
}): Promise<{ ok: true; file: VerifiedFile } | { error: string }> {
  const { objectKey, scope, context } = input;
  const drop = () => safeDeleteObject(scope, objectKey, context);

  let head: { sizeBytes: number; contentType: string } | null;
  try {
    head = await headObject(objectKey);
  } catch {
    // An ordinary network hiccup, not the person's fault, and not something
    // to delete over — the object may be perfectly fine.
    return { error: 'Не вдалося перевірити файл. Спробуйте ще раз' };
  }
  if (!head) return { error: 'Файл не знайдено. Спробуйте завантажити ще раз' };

  // The size and type R2 really stored — never what the browser declared at
  // the presign step. A bucket policy cannot enforce the university's own
  // 10 MB cap, so this is the first time it meets reality.
  const sizeFault = fileProblem({ declaredType: head.contentType, sizeBytes: head.sizeBytes });
  if (sizeFault) {
    await drop();
    return { error: sizeFault };
  }

  let bytes: Buffer;
  try {
    bytes = await getObjectBytes(objectKey);
  } catch {
    await drop();
    return { error: 'Не вдалося завантажити файл для перевірки' };
  }

  // The browser said PDF; the object may be anything. Sniffed from the bytes
  // themselves, and it must still match what was stored under that type.
  const sniffed = sniffType(bytes);
  if (!sniffed || sniffed !== head.contentType) {
    await drop();
    return { error: 'Вміст файлу не відповідає заявленому типу' };
  }

  const sha256 = sha256Hex(bytes);
  // Re-checked here because the pre-check before the upload can be raced by
  // two uploads of the same bytes. This narrows it; the unique index on
  // `sha256` is what actually decides.
  if (!input.allowDuplicate) {
    const duplicate = await db.scienceRecordFile.findUnique({
      where: { sha256 },
      select: { id: true },
    });
    if (duplicate) {
      await drop();
      return { error: DUPLICATE_FILE_MESSAGE };
    }
  }

  return {
    ok: true,
    file: {
      objectKey,
      fileName: cleanFileName(input.fileName),
      contentType: sniffed,
      sizeBytes: head.sizeBytes,
      // Item 4 pays 50 год PER PAGE, so a PDF's real page count is worth
      // keeping beside the claim a reviewer compares it against.
      pageCount: sniffed === 'application/pdf' ? await pdfPageCount(bytes) : null,
      sha256,
    },
  };
}

/** The `meta.target` test both write paths share: a P2002 on `sha256` or
 *  `objectKey` is D28's «already used», anything else is not. */
export function isDuplicateFileViolation(e: unknown): boolean {
  const target = String((e as { meta?: { target?: unknown } })?.meta?.target ?? '');
  return target.includes('sha256') || target.includes('objectKey');
}

// ─── One stored file, many works (owner, 2026-11-13) ─────────────────────────
//
// A вид роботи with `sharedFile` (the conference types) lets colleagues connect
// to the ONE file that is already stored instead of uploading it again. The
// browser learns this from `presignUpload` BEFORE any bytes move; the server
// then re-checks everything here, because «use file X» is a request like any
// other and a hand-made one must not borrow somebody's сертифікат.

/** What the browser hands a save: freshly uploaded bytes, or the id of a file
 *  that is already stored. Exactly one of the two. */
export type IncomingFile =
  | { objectKey: string; fileName: string; existingFileId?: undefined }
  | { existingFileId: string; fileName: string; objectKey?: undefined };

/** What a save writes: a verified new file, or an existing file to connect to. */
export type ResolvedFile =
  | { kind: 'new'; file: VerifiedFile }
  | { kind: 'existing'; fileId: string; fileName: string };

/** Where the file is going — the work's вид and its AUTHOR (the one who would
 *  hold the connection), never the uploader. */
export interface FileTarget {
  workTypeId: string;
  sharedFile: boolean;
  authorId: string;
}

/** A stored file with the works it is connected to — what `fileShareProblem`
 *  needs, selected one way everywhere. */
export const FILE_WITH_WORKS = {
  id: true,
  fileName: true,
  sizeBytes: true,
  pageCount: true,
  works: {
    select: {
      id: true,
      createdById: true,
      workTypeId: true,
      workType: { select: { sharedFile: true } },
    },
  },
} as const;

export function linkedWorksOf(file: {
  works: { createdById: string; workTypeId: string; workType: { sharedFile: boolean } }[];
}): LinkedWork[] {
  return file.works.map((w) => ({
    createdById: w.createdById,
    workTypeId: w.workTypeId,
    sharedFile: w.workType.sharedFile,
  }));
}

/**
 * Turn what the browser sent into something a save can write: a VERIFIED new
 * file, or an existing file this person is allowed to connect to.
 *
 * A refused request drops the uploaded object (if there was one) and says the
 * same sentence D28 always has — it names nothing about the other record.
 */
export async function resolveIncomingFile(input: {
  incoming: IncomingFile;
  target: FileTarget;
  scope: string;
  context: LogContext;
}): Promise<{ ok: true; use: ResolvedFile } | { error: string }> {
  const { incoming, target } = input;

  if (typeof incoming.existingFileId === 'string') {
    const file = await db.scienceRecordFile.findUnique({
      where: { id: incoming.existingFileId },
      select: FILE_WITH_WORKS,
    });
    const problem = file
      ? fileShareProblem({
          targetSharedFile: target.sharedFile,
          targetWorkTypeId: target.workTypeId,
          authorId: target.authorId,
          linked: linkedWorksOf(file),
        })
      : 'NOT_SHARABLE';
    if (!file || problem) return { error: DUPLICATE_FILE_MESSAGE };
    return { ok: true, use: { kind: 'existing', fileId: file.id, fileName: file.fileName } };
  }

  const verified = await verifyUploadedObject({
    objectKey: incoming.objectKey,
    fileName: incoming.fileName,
    scope: input.scope,
    context: input.context,
  });
  if ('error' in verified) return { error: verified.error };
  return { ok: true, use: { kind: 'new', file: verified.file } };
}
