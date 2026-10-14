'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useController, type Control } from 'react-hook-form';
import { ExternalLink, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { DateInput } from '@/components/aurora/ui/date-input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import type { FileUploader } from '@/components/science/evidence-file-field';
import { ScanField, type ScanChoice } from '@/components/science/scan-field';
import {
  discardCertificateUpload,
  presignCertificateUpload,
} from '@/app/(dashboard)/language-certificates/file-actions';
import {
  EMPTY_CERTIFICATE_ROW,
  type CertificateFormRow,
  type CertificateScans,
  type CertificatesFormValues,
} from '@/components/staff/certificate-form-values';
import { certificateFacts } from '@/lib/language-certificates/facts';
import {
  CERTIFICATE_ADD_LABELS,
  CERTIFICATE_FIELDS,
  CERTIFICATE_MIN_DATE,
  CERTIFICATE_TITLES,
  DEFAULT_ENGLISH_LEVEL,
  ENGLISH_LEVELS,
  type CertificateKind,
} from '@/lib/language-certificates/options';
import { todayInKyiv } from '@/validations/qualification';
import {
  englishCertificateSchema,
  ukrainianCertificateSchema,
} from '@/validations/language-certificate';

/**
 * The two language certificates of «Освіта» (owner, 2026-10-14) — **a button, then
 * a card, and the form in a popup**, exactly as the diplomas are.
 *
 * It was twenty fields laid straight into the card, which put a form nobody
 * needs in front of every person who simply has no such certificate (owner,
 * 2026-10-14: «not that much overpopulated with info for default user» — the
 * same mistake the diplomas were, before they became a list of cards).
 *
 * The popup edits a LOCAL draft and hands it back with «Готово»: nothing reaches
 * the profile form, let alone the database, until then, and Скасувати leaves the
 * card as it was. The profile's own «Зберегти» is what saves.
 *
 * **Optional as a whole, strict once begun** (`validations/language-certificate.ts`):
 * the popup checks its draft with the very schema the server applies.
 */

interface CertificateFieldsProps {
  control: Control<CertificatesFormValues>;
  isPending: boolean;
  /** A field outside what this viewer may write — greyed, still readable */
  locked?: (field: string) => boolean;
  scans: CertificateScans;
}

/** What one certificate puts on the card: its card once filled, else its add button. */
interface SlotParts {
  card: ReactNode;
  button: ReactNode;
  dialog: ReactNode;
}

/**
 * The cards and the add buttons are handed to the caller SEPARATELY (owner,
 * 2026-10-14: every «Додати …» button goes at the bottom of «Освіта», under all
 * the cards) — so the caller lays them out, and this keeps the popups and their
 * state. Both slots are called unconditionally, once each, never in a loop.
 */
export function CertificateFields({
  children,
  ...props
}: CertificateFieldsProps & {
  children: (parts: { cards: ReactNode; buttons: ReactNode }) => ReactNode;
}) {
  const english = useCertificateSlot('ENGLISH', props);
  const ukrainian = useCertificateSlot('UKRAINIAN', props);
  return (
    <>
      {children({
        cards: (
          <>
            {english.card}
            {ukrainian.card}
          </>
        ),
        buttons: (
          <>
            {english.button}
            {ukrainian.button}
          </>
        ),
      })}
      {english.dialog}
      {ukrainian.dialog}
    </>
  );
}

/** Has anything been entered? A bare scan choice does not count: it is nothing without a date. */
function hasContent(row: CertificateFormRow): boolean {
  return [
    row.series,
    row.number,
    row.issuedBy,
    row.issuedOn,
    row.level,
    row.decisionNumber,
    row.decisionDate,
    row.url,
  ].some((v) => v.trim() !== '');
}

function useCertificateSlot(
  kind: CertificateKind,
  { control, isPending, locked = () => false, scans }: CertificateFieldsProps
): SlotParts {
  const name = CERTIFICATE_FIELDS[kind];
  const { field } = useController({ name, control });
  const row = field.value as CertificateFormRow;
  const disabled = isPending || locked(name);
  const [open, setOpen] = useState(false);
  // The scan staged in the popup's CURRENT visit and not yet handed back. Every
  // way out but «Готово» abandons it, and an abandoned object is deleted — the
  // popup itself cannot do that for Esc and ×, which close it from outside.
  const visitScan = useRef<{ objectKey: string; fileName: string } | null>(null);

  const uploader: FileUploader = useMemo(
    () => ({
      presign: (file) =>
        presignCertificateUpload({
          staffId: scans.staffId,
          kind,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      discard: (objectKey) => void discardCertificateUpload(scans.staffId, kind, objectKey),
    }),
    [scans.staffId, kind]
  );

  // The scan the card names: one chosen in this form and not yet saved, else the
  // one already stored — unless the person has taken it away (`file: null`).
  const scanName =
    row.file === null ? null : row.file ? row.file.fileName : (scans.stored[kind]?.name ?? null);

  function closeDialog() {
    if (visitScan.current) uploader.discard(visitScan.current.objectKey);
    visitScan.current = null;
    setOpen(false);
  }

  function remove() {
    // A scan staged in this form and never saved goes with the card.
    if (row.file) uploader.discard(row.file.objectKey);
    field.onChange({ ...EMPTY_CERTIFICATE_ROW });
  }

  const filled = hasContent(row);

  const card = filled ? (
    <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{CERTIFICATE_TITLES[kind]}</p>
        <p className="mt-0.5 text-sm text-foreground-soft">
          {certificateFacts(kind, row).join(' · ')}
        </p>
        {row.url.trim() && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-soft">
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{row.url.trim()}</span>
          </p>
        )}
        {scanName && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-soft">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{scanName}</span>
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Редагувати сертифікат"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Прибрати сертифікат"
        disabled={disabled}
        onClick={remove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  ) : null;

  const button = filled ? null : (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled}
      onClick={() => setOpen(true)}
    >
      <Plus className="size-4" />
      {CERTIFICATE_ADD_LABELS[kind]}
    </Button>
  );

  const dialog = (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
      <DialogContent
        // The first control is a text box; do not let the popup grab focus.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Typed input must survive a stray click away; Esc and × still close.
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Mounted only while open, so the draft starts fresh each time — from
              the card being edited, or blank. */}
        {open && (
          <CertificateForm
            kind={kind}
            initial={row}
            stored={scans.stored[kind]}
            uploader={uploader}
            adding={!filled}
            onStaged={(file) => {
              visitScan.current = file;
            }}
            onCancel={closeDialog}
            onDone={(draft) => {
              // A scan the card HAD, staged in an earlier visit, that this draft
              // replaced or removed will never be saved: let it go now.
              if (row.file && draft.file !== row.file) uploader.discard(row.file.objectKey);
              visitScan.current = null;
              field.onChange(draft);
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  return { card, button, dialog };
}

function CertificateForm({
  kind,
  initial,
  stored,
  uploader,
  adding,
  onStaged,
  onCancel,
  onDone,
}: {
  kind: CertificateKind;
  initial: CertificateFormRow;
  stored: { name: string } | null;
  uploader: FileUploader;
  adding: boolean;
  /** Tells the slot what this visit has staged, so closing can discard it */
  onStaged: (file: { objectKey: string; fileName: string } | null) => void;
  onCancel: () => void;
  onDone: (draft: CertificateFormRow) => void;
}) {
  // The English certificate is B2 and up, and B2 — the baseline — is where every one
  // starts (owner, 2026-10-14). It lives in the DRAFT only: an untouched form row
  // keeps an empty level, so the default alone never makes a certificate «entered».
  const [draft, setDraft] = useState<CertificateFormRow>(() => ({
    ...initial,
    level: initial.level || (kind === 'ENGLISH' ? DEFAULT_ENGLISH_LEVEL : ''),
  }));
  // First message per field, from the same schema the server applies.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const set = (patch: Partial<CertificateFormRow>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // A field being corrected stops being red.
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };
  const err = (field: keyof CertificateFormRow) =>
    errors[field] ? { message: errors[field] } : undefined;

  // The scan the popup opened with, as the scan field should present it: one staged
  // in an earlier visit shows as a chip, like a stored one.
  const opened = initial.file;
  const storedForField =
    opened && typeof opened === 'object'
      ? { name: opened.fileName }
      : opened === null
        ? null
        : stored;

  function chooseScan(choice: ScanChoice) {
    // `undefined` keeps whatever the card had.
    set({ file: choice === undefined ? opened : choice });
    onStaged(choice && typeof choice === 'object' ? choice : null);
  }

  function done() {
    const schema = kind === 'ENGLISH' ? englishCertificateSchema : ukrainianCertificateSchema;
    const result = schema.safeParse(draft);
    if (!result.success) {
      const first: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !first[key]) first[key] = issue.message;
      }
      setErrors(first);
      return;
    }
    // Nothing entered is no certificate: close without changing a thing.
    if (result.data === null) {
      onCancel();
      return;
    }
    onDone(draft);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {adding ? CERTIFICATE_ADD_LABELS[kind] : CERTIFICATE_TITLES[kind]}
        </DialogTitle>
        <DialogDescription>Вкажіть дані сертифіката. Файл — за бажанням.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="cert-series" label="Серія" error={err('series')}>
              <Input
                id="cert-series"
                autoComplete="off"
                value={draft.series}
                onChange={(e) => set({ series: e.target.value })}
              />
            </FormField>
            <FormField htmlFor="cert-number" label="Номер" required error={err('number')}>
              <Input
                id="cert-number"
                autoComplete="off"
                value={draft.number}
                onChange={(e) => set({ number: e.target.value })}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="cert-level"
              label={kind === 'ENGLISH' ? 'Рівень' : 'Рівень володіння'}
              required
              error={err('level')}
            >
              {kind === 'ENGLISH' ? (
                // B2 and up, from a list (owner, 2026-10-14).
                <Select value={draft.level} onValueChange={(level) => set({ level })}>
                  <SelectTrigger id="cert-level" className="w-full" aria-invalid={!!errors.level}>
                    <SelectValue placeholder="Оберіть рівень" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGLISH_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // The Ukrainian one is free text, as the certificate words it.
                <Input
                  id="cert-level"
                  autoComplete="off"
                  value={draft.level}
                  onChange={(e) => set({ level: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              htmlFor="cert-issued-on"
              label="Дата видачі"
              required
              error={err('issuedOn')}
            >
              <DateInput
                id="cert-issued-on"
                value={draft.issuedOn}
                onChange={(issuedOn) => set({ issuedOn })}
                min={CERTIFICATE_MIN_DATE}
                max={todayInKyiv()}
                aria-invalid={!!errors.issuedOn}
              />
            </FormField>
          </div>

          {kind === 'ENGLISH' ? (
            <FormField
              htmlFor="cert-issued-by"
              label="Ким виданий"
              required
              error={err('issuedBy')}
            >
              <Input
                id="cert-issued-by"
                autoComplete="off"
                value={draft.issuedBy}
                onChange={(e) => set({ issuedBy: e.target.value })}
              />
            </FormField>
          ) : (
            // One general label, two inputs under it (owner, 2026-10-14) — not the
            // whole sentence copied onto each box.
            <FieldSet>
              <FieldLegend variant="label" className="font-normal">
                Рішення Національної комісії зі стандартів державної мови
              </FieldLegend>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  htmlFor="cert-decision-number"
                  label="Номер"
                  error={err('decisionNumber')}
                >
                  <Input
                    id="cert-decision-number"
                    autoComplete="off"
                    value={draft.decisionNumber}
                    onChange={(e) => set({ decisionNumber: e.target.value })}
                  />
                </FormField>
                <FormField htmlFor="cert-decision-date" label="Дата" error={err('decisionDate')}>
                  <DateInput
                    id="cert-decision-date"
                    value={draft.decisionDate}
                    onChange={(decisionDate) => set({ decisionDate })}
                    min={CERTIFICATE_MIN_DATE}
                    max={todayInKyiv()}
                    aria-invalid={!!errors.decisionDate}
                  />
                </FormField>
              </div>
            </FieldSet>
          )}

          <FormField
            htmlFor="cert-url"
            label="Посилання"
            description="Необов’язково."
            error={err('url')}
          >
            <Input
              id="cert-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={draft.url}
              onChange={(e) => set({ url: e.target.value })}
            />
          </FormField>

          <FormField
            htmlFor="cert-file"
            label="Файл"
            description="Необов’язково. PDF, JPG чи PNG до 10 МБ."
          >
            <ScanField
              id="cert-file"
              stored={storedForField}
              uploader={uploader}
              onChange={chooseScan}
              onBusyChange={setUploading}
            />
          </FormField>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Скасувати
        </Button>
        <Button type="button" onClick={done} disabled={uploading} loading={uploading}>
          {uploading ? 'Завантаження файлу…' : adding ? 'Додати' : 'Готово'}
        </Button>
      </DialogFooter>
    </>
  );
}
