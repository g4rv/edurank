/**
 * Files are chosen at once and uploaded only when the form is SAVED.
 *
 * Why (owner, 2026-11-14): uploading the moment a file was picked left an object
 * in R2 whenever the form was never saved — a closed tab, a lost connection,
 * a person who thought better of it — and the picker stayed busy (and the form's
 * button blocked) for as long as the network took, for ever when it hung.
 *
 * How: picking a file registers it here and hands the form a PLACEHOLDER with
 * the same shape as an uploaded file — `{ objectKey: 'pending:<id>', fileName }`.
 * Every schema and every piece of form state keeps working, because to them it is
 * a string. The place that SENDS the form wraps its server action in
 * `saveWithUploads`, which finds the placeholders in the payload, uploads each
 * file (a timeout on every step, one Cancel for all), swaps in the real key and
 * calls the action. If anything fails, what already went up is deleted again:
 * a failed save leaves nothing in R2.
 *
 * A placeholder that reaches a server action unresolved is refused there (the key
 * is in nobody's folder) — forgetting to wrap a save fails loudly, it cannot
 * store a wrong file.
 */

export const PENDING_PREFIX = 'pending:';
/** The server's answer to «may this file go up», including its duplicate rules. */
export const PRESIGN_TIMEOUT_MS = 20_000;
/** One PUT. Slow is not stuck: a 10 MB scan on a weak phone connection is allowed
 *  two minutes. */
export const UPLOAD_TIMEOUT_MS = 120_000;

export type PresignResult =
  | { ok: true; url: string; objectKey: string }
  | { ok: true; reuse: { fileId: string; fileName: string } }
  | { error: string };

/**
 * How a chosen file reaches R2. The science evidence flow is the default; a
 * qualification scan brings its own (no university-wide duplicate rule, so no
 * hash, and a key in the owner's folder).
 */
export interface FileUploader {
  /** A presigned PUT for this file, or the sentence that refuses it. */
  presign: (file: File) => Promise<PresignResult>;
  /** Let go of an object nobody ended up pointing at. Fire-and-forget. */
  discard: (objectKey: string) => void;
}

interface Entry {
  file: File;
  /** A getter, not a value: the uploader may depend on what the form says at SAVE
   *  time (a science file's вид роботи can change after the file was picked). */
  getUploader: () => FileUploader;
  /** Set once a save that carried the file SUCCEEDED. A form that stays open after
   *  saving still holds the placeholder; saving again must not upload it twice. */
  resolved?: Record<string, unknown>;
}

const entries = new Map<string, Entry>();

export const isPendingKey = (key: string): boolean => key.startsWith(PENDING_PREFIX);

/** Remember a chosen file and give the form the placeholder that stands for it. */
export function registerPending(
  file: File,
  getUploader: () => FileUploader
): { objectKey: string; fileName: string } {
  const objectKey = `${PENDING_PREFIX}${crypto.randomUUID()}`;
  entries.set(objectKey, { file, getUploader });
  return { objectKey, fileName: file.name };
}

/** Forget a file that was removed, replaced or abandoned. Nothing was uploaded, so
 *  there is nothing to delete. */
export function dropPending(objectKey: string): void {
  entries.delete(objectKey);
}

/** A key a form may hold: forgotten if it is a placeholder, deleted in R2 otherwise. */
export function releaseKey(uploader: FileUploader, objectKey: string): void {
  if (isPendingKey(objectKey)) dropPending(objectKey);
  else uploader.discard(objectKey);
}

/** Wraps an uploader so its `discard` understands placeholders. */
export function withPlaceholders(uploader: FileUploader): FileUploader {
  return {
    presign: uploader.presign,
    discard: (objectKey) => releaseKey(uploader, objectKey),
  };
}

// ── What the overlay shows ─────────────────────────────────────────────────

export type SavePhase = 'idle' | 'uploading' | 'saving';
let phase: SavePhase = 'idle';
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

export function subscribeSaving(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** What the overlay shows: nothing, files going up (Cancel works), or the record
 *  being written (it is too late to cancel). */
export const savePhase = (): SavePhase => phase;

function setPhase(next: SavePhase) {
  phase = next;
  for (const listener of [...listeners]) listener();
}

/** The one Cancel button of the overlay. */
export function cancelSaving(): void {
  controller?.abort();
}

// ── Finding and replacing placeholders ─────────────────────────────────────

type Pending = { objectKey: string; fileName: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

const isPlaceholder = (v: unknown): v is Pending =>
  isPlainObject(v) && typeof v.objectKey === 'string' && isPendingKey(v.objectKey);

/** Does the payload hold any file that still has to go up? */
export function hasPending(node: unknown): boolean {
  if (isPlaceholder(node)) return true;
  if (Array.isArray(node)) return node.some(hasPending);
  if (isPlainObject(node)) return Object.values(node).some(hasPending);
  return false;
}

async function replacePending(
  node: unknown,
  resolve: (placeholder: Pending) => Promise<Record<string, unknown>>
): Promise<unknown> {
  if (isPlaceholder(node)) {
    // Merged, so a payload that SPREADS the file (`{ ...file, workId }`) keeps its
    // other keys.
    const rest: Record<string, unknown> = { ...node };
    delete rest.objectKey;
    delete rest.fileName;
    return { ...rest, ...(await resolve(node)) };
  }
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const item of node) out.push(await replacePending(item, resolve)); // one at a time
    return out;
  }
  if (isPlainObject(node)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = await replacePending(value, resolve);
    }
    return out;
  }
  return node;
}

// ── Uploading ──────────────────────────────────────────────────────────────

const NOTHING_SAVED = 'Нічого не збережено';

class UploadStopped extends Error {}

const MESSAGES = {
  timeout: `Завантаження файлу тривало надто довго і було зупинено. ${NOTHING_SAVED} — перевірте з’єднання та спробуйте ще раз`,
  cancel: `Збереження скасовано. ${NOTHING_SAVED}`,
  // The commonest cause by far is the bucket having no CORS rule for this origin,
  // which no amount of retrying fixes — so the sentence points at somebody who can.
  network: `Не вдалося завантажити файл. ${NOTHING_SAVED} — спробуйте ще раз або зверніться до адміністратора`,
  lost: `Файл більше не доступний. ${NOTHING_SAVED} — оберіть його ще раз`,
  presign: `Не вдалося перевірити файл. ${NOTHING_SAVED} — спробуйте ще раз`,
} as const;

/** `work` against `ms` and the person's Cancel. */
function race<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UploadStopped(MESSAGES.timeout)), ms);
    const onAbort = () => reject(new UploadStopped(MESSAGES.cancel));
    if (signal.aborted) onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    work
      .then(resolve, (e) =>
        reject(new UploadStopped(e instanceof UploadStopped ? e.message : MESSAGES.presign))
      )
      .finally(() => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      });
  });
}

async function put(url: string, file: File, signal: AbortSignal): Promise<void> {
  const own = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    own.abort();
  }, UPLOAD_TIMEOUT_MS);
  const onAbort = () => own.abort();
  if (signal.aborted) own.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
      signal: own.signal,
    });
    if (!res.ok) throw new UploadStopped(MESSAGES.network);
  } catch (e) {
    if (e instanceof UploadStopped) throw e;
    if (timedOut) throw new UploadStopped(MESSAGES.timeout);
    if (signal.aborted) throw new UploadStopped(MESSAGES.cancel);
    throw new UploadStopped(MESSAGES.network);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** The usual refusal shape of a server action: `{ error }`. */
function refused(answer: object): boolean {
  return 'error' in answer;
}

/**
 * Uploads every file the payload still holds, calls `send` with the payload
 * carrying the real keys, and gives back whatever `send` answered — or
 * `{ error }` in the person's words when an upload failed. **Nothing is saved
 * when it returns an upload error**, and anything that already went up is deleted.
 *
 * `failed` says whether `send`'s own answer means the save did not happen; if so
 * the objects uploaded for it are deleted too (default: an `{ error }`).
 *
 * A payload with no file waiting passes straight through: no overlay, no timers.
 */
export async function saveWithUploads<T, R extends object>(
  payload: T,
  send: (resolved: T) => Promise<R>,
  failed: (answer: R) => boolean = refused
): Promise<R | { error: string }> {
  if (!hasPending(payload)) return send(payload);

  const run = new AbortController();
  controller = run;
  setPhase('uploading');
  const uploaded: { uploader: FileUploader; objectKey: string }[] = [];
  const fresh: { key: string; value: Record<string, unknown> }[] = [];
  const undo = () => {
    for (const { uploader, objectKey } of uploaded) uploader.discard(objectKey);
  };

  try {
    const resolved = (await replacePending(payload, async (placeholder) => {
      const entry = entries.get(placeholder.objectKey);
      if (!entry) throw new UploadStopped(MESSAGES.lost);
      if (entry.resolved) return entry.resolved; // already saved once
      const uploader = entry.getUploader();

      const presigned = await race(uploader.presign(entry.file), PRESIGN_TIMEOUT_MS, run.signal);
      // The server's own sentence (a duplicate file, a wrong type) stands alone.
      if ('error' in presigned) throw new UploadStopped(presigned.error);
      // Already in the system and shareable: nothing goes up, the save connects
      // the work to the stored file.
      if ('reuse' in presigned) {
        const value = {
          existingFileId: presigned.reuse.fileId,
          fileName: presigned.reuse.fileName,
        };
        fresh.push({ key: placeholder.objectKey, value });
        return value;
      }
      await put(presigned.url, entry.file, run.signal);
      uploaded.push({ uploader, objectKey: presigned.objectKey });
      const value = { objectKey: presigned.objectKey, fileName: entry.file.name };
      fresh.push({ key: placeholder.objectKey, value });
      return value;
    })) as T;

    if (run.signal.aborted) throw new UploadStopped(MESSAGES.cancel);
    setPhase('saving');
    const answer = await send(resolved);
    if (failed(answer)) undo();
    else {
      for (const { key, value } of fresh) {
        const entry = entries.get(key);
        if (entry) entry.resolved = value;
      }
    }
    return answer;
  } catch (e) {
    undo();
    if (e instanceof UploadStopped) return { error: e.message };
    throw e;
  } finally {
    if (controller === run) controller = null;
    setPhase('idle');
  }
}
