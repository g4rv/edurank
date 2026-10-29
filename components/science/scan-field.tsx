'use client';

import { useState } from 'react';
import { Button } from '@/components/aurora/ui/button';
import {
  EvidenceFileField,
  type FileUploader,
  type StagedFile,
} from '@/components/science/evidence-file-field';

/**
 * What a form hands the server about ONE optional scan — the same tri-state the
 * qualifications and the language certificates both use:
 *
 * - `undefined` — leave the stored scan as it is (and with none stored: none);
 * - `null` — take the stored scan away;
 * - an object — a new, already-uploaded scan replaces it.
 */
export type ScanChoice = StagedFile | null | undefined;

/**
 * An optional scan on a form: the stored one with «Замінити або прибрати», or a
 * picker that uploads straight to R2 the moment a file is chosen.
 *
 * **Extracted from the qualifications' dialog when the language certificates
 * became its second caller** (aurora.md §11) — the keep / replace / remove rules
 * are the same and were about to be written twice. It owns the picker's own state
 * and reports only the resulting `ScanChoice`; the caller decides what the
 * upload talks to (`uploader`) and what to do with the choice on save.
 *
 * A scan that was staged and then replaced, removed or abandoned is discarded
 * through `uploader.discard`, here. One still staged when the form is LEFT is the
 * caller's to discard — it is the caller that knows the form is closing.
 */
export function ScanField({
  id,
  stored,
  uploader,
  onChange,
  onBusyChange,
  disabled,
  only,
}: {
  id: string;
  /** The scan the record already holds, if any */
  stored: { name: string } | null;
  uploader: FileUploader;
  onChange: (choice: ScanChoice) => void;
  /** True while a chosen file is being checked or uploaded */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** One format only — see `EvidenceFileField` */
  only?: { type: string; accept: string; message: string };
}) {
  const [staged, setStaged] = useState<StagedFile | null>(null);
  // The stored scan may be kept, or swapped / taken away.
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);

  function busyChanged(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  if (stored && !replacing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-foreground/6 px-3 py-2 text-sm">
        <span className="min-w-0 truncate" title={stored.name}>
          {stored.name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setReplacing(true);
            onChange(null);
          }}
        >
          Замінити або прибрати
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <EvidenceFileField
        id={id}
        value={staged}
        onChange={(file) => {
          setStaged(file);
          // Cleared while a stored scan is being replaced: the person has chosen to
          // take it away, and has not chosen another.
          onChange(file ?? (stored ? null : undefined));
        }}
        onBusyChange={busyChanged}
        disabled={disabled}
        uploader={uploader}
        only={only}
      />
      {stored && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground-soft">
            {staged
              ? 'Поточний файл буде замінено після збереження.'
              : 'Поточний файл буде прибрано після збереження.'}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={() => {
              // Changed their mind: keep what is stored. A staged scan is
              // discarded with the choice.
              if (staged) uploader.discard(staged.objectKey);
              setStaged(null);
              setReplacing(false);
              onChange(undefined);
            }}
          >
            Залишити поточний
          </Button>
        </div>
      )}
    </div>
  );
}
