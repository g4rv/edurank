'use client';

import * as React from 'react';
import { FileInput } from '@/components/aurora/ui/file-input';
import { discardUpload, presignUpload } from '@/app/(dashboard)/science-plan/file-actions';
import { registerPending, releaseKey, type FileUploader } from '@/lib/files/pending-upload';
import { ACCEPT_FILE_TYPES, fileProblem } from '@/lib/science/file-limits';
import { compressImage } from '@/lib/files/compress-image';

/** An object already sitting in R2, waiting for something to point at it.
 *  `saveRecord` and `attachFile` both take exactly this. */
export interface StagedFile {
  objectKey: string;
  fileName: string;
}

/** A file the server ALREADY stores (a conference programme a colleague
 *  uploaded) — nothing is uploaded, the save connects the work to it. */
export interface StagedExisting {
  existingFileId: string;
  fileName: string;
}

/** What the science dialogs hold and hand to `saveRecord` / `attachFile` /
 *  `replaceFile` — exactly one of the two shapes. */
export type StagedValue = StagedFile | StagedExisting;

/** The same SHA-256 the server will compute, done before the upload so a
 *  duplicate costs a round trip instead of 10 MB. `crypto.subtle` needs HTTPS
 *  or localhost — which is every environment this runs in. */
async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type { FileUploader };

/**
 * What the file is FOR, so the server's courtesy duplicate check applies the
 * right rule: a вид роботи whose file is shared (a conference programme) is not
 * refused because a colleague attached the same one. One of the three, or none.
 */
export interface FileTarget {
  workTypeId?: string;
  workId?: string;
  fileId?: string;
}

const scienceUploaderFor = (target?: FileTarget): FileUploader => ({
  presign: async (file) =>
    presignUpload({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      // Computed here, and only for science: it lets D28 refuse a duplicate in
      // a round trip instead of after a 10 MB PUT.
      sha256: await hashFile(file),
      ...target,
    }),
  discard: (objectKey) => void discardUpload(objectKey),
});

type Status = 'idle' | 'checking' | 'ready' | 'error';

/**
 * Picks a file — and does NOTHING with the network.
 *
 * The file is checked here (type, size) and shrunk if it is a photo, then kept in
 * the browser. The form gets a placeholder `{ objectKey: 'pending:…', fileName }`
 * (`lib/files/pending-upload.ts`) and the save step uploads the real file, behind
 * an overlay with a timeout and a Cancel. Nothing reaches R2 unless the form is
 * actually saved, so an abandoned form leaves nothing behind.
 *
 * The old version uploaded the moment a file was picked. That left an object in
 * R2 for every form closed unsaved, and the picker stayed busy for as long as the
 * network took — for ever when it hung (owner, 2026-11-14).
 *
 * **`onBusyChange` stays**: shrinking a large photo takes a moment, and saving
 * before it finishes would send the original.
 */
export function EvidenceFileField({
  id,
  value,
  onChange,
  onBusyChange,
  disabled,
  uploader: customUploader,
  target,
  only,
}: {
  id?: string;
  /** The held file, owned by the caller so it can be submitted or cleared. */
  value: StagedValue | null;
  onChange: (file: StagedValue | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** Defaults to the science evidence flow. */
  uploader?: FileUploader;
  /** What the file is for — see `FileTarget`. Science flow only. */
  target?: FileTarget;
  /**
   * One format only, where a caller narrows the usual three — a diploma scan is
   * JPG (owner, 2026-10-27). Refused before anything is held, in the caller's
   * words; the server checks the stored bytes again.
   */
  only?: { type: string; accept: string; message: string };
}) {
  // The uploader is read when the form is SAVED, not now: the вид роботи a science
  // file is for may change after the file was picked. A ref keeps the newest.
  const uploader = customUploader ?? scienceUploaderFor(target);
  const uploaderRef = React.useRef<FileUploader>(uploader);
  React.useEffect(() => {
    uploaderRef.current = uploader;
  });

  // What the picker SHOWS. Kept beside `value` because `File` carries the name
  // and size a person recognises, while `value` is what the server needs.
  const [file, setFile] = React.useState<File | null>(null);
  const [status, setStatus] = React.useState<Status>('idle');
  const [problem, setProblem] = React.useState<string | null>(null);
  // Which pick is current — shrinking is asynchronous and a second pick may win.
  const pickRef = React.useRef(0);

  const busy = status === 'checking';
  React.useEffect(() => {
    onBusyChange?.(busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function hold(picked: File) {
    const pick = ++pickRef.current;
    setProblem(null);
    if (only && picked.type !== only.type) {
      setProblem(only.message);
      setStatus('error');
      return;
    }

    // Shrink a JPG/PNG first, so a 15 MB phone photo is not refused for its
    // size and R2 never stores the original.
    setStatus('checking');
    const chosen = await compressImage(picked);
    if (pick !== pickRef.current) return;
    if (chosen !== picked) setFile(chosen);

    // Refused here, in the same words the server would use, so a 500 MB file is
    // never held at all.
    const localFault = fileProblem({ declaredType: chosen.type, sizeBytes: chosen.size });
    if (localFault) {
      setProblem(localFault);
      setStatus('error');
      return;
    }

    onChange(registerPending(chosen, () => uploaderRef.current));
    setStatus('ready');
  }

  function choose(chosen: File | null) {
    pickRef.current += 1;
    // Replacing or clearing forgets whatever was held (a key already in R2 — a
    // form older than this change — is deleted).
    if (value && 'objectKey' in value) releaseKey(uploaderRef.current, value.objectKey);
    onChange(null);
    setFile(chosen);

    if (!chosen) {
      setProblem(null);
      setStatus('idle');
      return;
    }
    void hold(chosen);
  }

  return (
    <div className="space-y-1">
      <FileInput
        id={id}
        value={file}
        onChange={choose}
        accept={only?.accept ?? ACCEPT_FILE_TYPES}
        disabled={disabled || busy}
      />
      {status === 'checking' && <p className="text-sm text-foreground-soft">Підготовка файлу…</p>}
      {status === 'ready' && (
        <p className="text-sm text-success">Файл буде завантажено під час збереження</p>
      )}
      {/* Inline, under the control it belongs to — never a toast for something
          a field can show itself. */}
      {problem && <p className="text-sm text-error-strong">{problem}</p>}
    </div>
  );
}
