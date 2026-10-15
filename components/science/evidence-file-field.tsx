'use client';

import * as React from 'react';
import { FileInput } from '@/components/aurora/ui/file-input';
import { discardUpload, presignUpload } from '@/app/(dashboard)/science-plan/file-actions';
import { ACCEPT_FILE_TYPES, fileProblem } from '@/lib/science/file-limits';
import { compressImage } from '@/lib/files/compress-image';

/** An object already sitting in R2, waiting for something to point at it.
 *  `saveRecord` and `attachFile` both take exactly this. */
export interface StagedFile {
  objectKey: string;
  fileName: string;
}

/** The same SHA-256 the server will compute, done before the upload so a
 *  duplicate costs a round trip instead of 10 MB. `crypto.subtle` needs HTTPS
 *  or localhost — which is every environment this runs in. */
async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * How a chosen file reaches R2. The science evidence flow is the default; a
 * qualification scan brings its own (no university-wide duplicate rule, so no
 * hash, and a key in the owner's folder). The picker, the status line and the
 * browser-side checks are the same either way.
 */
export interface FileUploader {
  /** A presigned PUT for this file, or the sentence that refuses it. */
  presign: (
    file: File
  ) => Promise<{ ok: true; url: string; objectKey: string } | { error: string }>;
  /** Let go of an object nobody ended up pointing at. Fire-and-forget. */
  discard: (objectKey: string) => void;
}

const scienceUploader: FileUploader = {
  presign: async (file) =>
    presignUpload({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      // Computed here, and only for science: it lets D28 refuse a duplicate in
      // a round trip instead of after a 10 MB PUT.
      sha256: await hashFile(file),
    }),
  discard: (objectKey) => void discardUpload(objectKey),
};

type Status = 'idle' | 'checking' | 'uploading' | 'ready' | 'error';

const BUSY: Status[] = ['checking', 'uploading'];

/**
 * Picks a file and puts it in R2 **immediately**, before anything is saved.
 *
 * The old version did the opposite: it waited for the record to exist, because
 * the object key contained the work's id. Three things were wrong with that
 * order, and all three are gone now that `objectKeyFor` names only the year:
 *
 * 1. **A record could not be proved by a file alone.** At save time there was
 *    never a file, so `evidenceProblem` always saw zero and a link was in
 *    practice mandatory — the exact case D27 exists for (a сертифікат with no
 *    public page) could not be entered.
 * 2. **A failed upload was unrecoverable.** The record was already saved; the
 *    message said «Спробуйте ще раз» and there was nothing to press.
 * 3. The dialog had to lock its own form and stay open babysitting a `PUT`.
 *
 * Now the upload finishes (or fails, retryably) while the person is still
 * filling the form, and the save carries a key the server verifies from the
 * stored bytes. Failure costs one orphaned object, which `discardUpload`
 * clears whenever the person removes or replaces their choice.
 *
 * **`onBusyChange` exists so the caller can guard its own submit button** —
 * saving a record whose file is still going up would send a key R2 has not
 * finished writing.
 */
export function EvidenceFileField({
  id,
  value,
  onChange,
  onBusyChange,
  disabled,
  uploader = scienceUploader,
}: {
  id?: string;
  /** The staged object, held by the caller so it can be submitted or cleared. */
  value: StagedFile | null;
  onChange: (file: StagedFile | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** Defaults to the science evidence flow. */
  uploader?: FileUploader;
}) {
  // What the picker SHOWS. Kept beside `value` because `File` carries the name
  // and size a person recognises, while `value` is what the server needs.
  const [file, setFile] = React.useState<File | null>(null);
  const [status, setStatus] = React.useState<Status>('idle');
  const [problem, setProblem] = React.useState<string | null>(null);

  const busy = BUSY.includes(status);
  React.useEffect(() => {
    onBusyChange?.(busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  /** Whatever was already up there is no longer wanted — let it go, but never
   *  make the person wait for it or hear about it. */
  function releaseStaged(staged: StagedFile | null) {
    if (staged) uploader.discard(staged.objectKey);
  }

  async function upload(picked: File) {
    setProblem(null);

    // Shrink a JPG/PNG first, so a 15 MB phone photo is not refused for its
    // size and R2 never stores the original. Everything below — the checks,
    // the hash, the PUT — then sees the file that is actually kept.
    setStatus('checking');
    const chosen = await compressImage(picked);
    if (chosen !== picked) setFile(chosen);

    // Refused here first, in the same words the server would use, so a 500 MB
    // file never reaches `crypto.subtle` and freezes the tab.
    const localFault = fileProblem({ declaredType: chosen.type, sizeBytes: chosen.size });
    if (localFault) {
      setProblem(localFault);
      setStatus('error');
      return;
    }

    setStatus('checking');
    const presigned = await uploader.presign(chosen);
    if ('error' in presigned) {
      setProblem(presigned.error);
      setStatus('error');
      return;
    }

    setStatus('uploading');
    try {
      const put = await fetch(presigned.url, {
        method: 'PUT',
        body: chosen,
        headers: { 'Content-Type': chosen.type },
      });
      if (!put.ok) throw new Error(`PUT ${put.status}`);
    } catch {
      // The commonest cause by far is the bucket having no CORS rule for this
      // origin, which no amount of retrying fixes — so the sentence points at
      // somebody who can, instead of asking the person to try for ever.
      setProblem('Не вдалося завантажити файл. Спробуйте ще раз або зверніться до адміністратора');
      setStatus('error');
      return;
    }

    onChange({ objectKey: presigned.objectKey, fileName: chosen.name });
    setStatus('ready');
  }

  function choose(chosen: File | null) {
    // Replacing or clearing abandons whatever is already in the bucket.
    releaseStaged(value);
    onChange(null);
    setFile(chosen);

    if (!chosen) {
      setProblem(null);
      setStatus('idle');
      return;
    }
    void upload(chosen);
  }

  return (
    <div className="space-y-1">
      <FileInput
        id={id}
        value={file}
        onChange={choose}
        accept={ACCEPT_FILE_TYPES}
        disabled={disabled || busy}
      />
      {status === 'checking' && <p className="text-sm text-foreground-soft">Перевірка файлу…</p>}
      {status === 'uploading' && <p className="text-sm text-foreground-soft">Завантаження…</p>}
      {status === 'ready' && <p className="text-sm text-success">Файл готовий до збереження</p>}
      {/* Inline, under the control it belongs to — never a toast for something
          a field can show itself. */}
      {problem && <p className="text-sm text-error-strong">{problem}</p>}
    </div>
  );
}
