'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  createQualification,
  updateQualification,
  type StagedQualificationFile,
} from '@/app/(dashboard)/qualifications/actions';
import {
  discardQualificationUpload,
  presignQualificationUpload,
} from '@/app/(dashboard)/qualifications/file-actions';
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
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { SegmentedControl } from '@/components/aurora/ui/segmented-control';
import { FormField } from '@/components/ui/form-field';
import { RequiredFields } from '@/components/ui/required-fields';
import { DialogProblem } from '@/components/science/dialog-problem';
import type { FileUploader } from '@/components/science/evidence-file-field';
import { ScanField, type ScanChoice } from '@/components/science/scan-field';
import { attempt, CONNECTION_PROBLEM } from '@/lib/science/attempt';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  QUALIFICATION_KINDS,
  QUALIFICATION_KIND_LABELS,
  topicLabel,
  type DocumentTypeKey,
} from '@/lib/qualifications/options';
import type { QualificationRow } from '@/lib/queries/list-qualifications';
import { qualificationMinDate } from '@/lib/qualifications/window';
import { HOURS_PER_CREDIT, hoursFromCredits, hoursLabel } from '@/lib/qualifications/format';
import { fromHundredths } from '@/lib/stake/units';
import {
  qualificationSchemaFor,
  todayInKyiv,
  type QualificationFormValues,
} from '@/validations/qualification';

/**
 * «Додати запис» / «Редагувати» — one form for both.
 *
 * **Opened by the НПП for their own record and by ADMIN for anybody's**; a
 * reader with only the division switch never sees it, and every action checks
 * the right again (`lib/qualifications/access.ts`).
 *
 * The label of the topic box follows the DOCUMENT, not the kind: a диплом names
 * a спеціальність, a довідка or сертифікат the тема (owner, 2026-10-13).
 *
 * The scan goes up the moment it is chosen, before anything is saved, and the
 * save carries its key — the flow science evidence already uses, through the
 * shared `ScanField` (over `EvidenceFileField`) with this feature's own uploader. A form holding
 * unsaved input does not close on a click outside (aurora.md §10).
 */
export function QualificationDialog({
  staffId,
  qualification,
  triggerClassName,
}: {
  /** Whose record this is. */
  staffId: string;
  /** Present → edit this one; absent → add. */
  qualification?: QualificationRow;
  /** For the add button inside a toolbar strip (`rounded-md`). */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const editing = !!qualification;

  // The scan the form has put in R2 but not yet saved. Held HERE, where closing
  // happens: leaving the dialog any way but a successful save (Esc, ×) abandons
  // it, and abandoning it deletes the object. A ref because only event handlers
  // read it.
  const stagedRef = useRef<StagedQualificationFile | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next && stagedRef.current) {
      void discardQualificationUpload(staffId, stagedRef.current.objectKey);
    }
    stagedRef.current = null;
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Редагувати запис «${qualification.topic}»`}
          >
            <Pencil className="size-3.5" />
            Редагувати
          </Button>
        ) : (
          <Button variant="brand" className={triggerClassName}>
            <Plus className="size-4" />
            Додати запис
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        // Typed input must survive a stray click away; Esc and × still close.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Редагувати запис' : 'Підвищення кваліфікації / Стажування'}
          </DialogTitle>
          <DialogDescription>
            Вкажіть дані документа. Скан — за бажанням: PDF, JPG чи PNG до 10 МБ.
          </DialogDescription>
        </DialogHeader>

        <QualificationForm
          staffId={staffId}
          qualification={qualification}
          onStagedChange={(file) => {
            stagedRef.current = file;
          }}
          // Saved: the record now holds the scan, so there is nothing to discard.
          onDone={() => {
            stagedRef.current = null;
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function defaultsFor(q?: QualificationRow): QualificationFormValues {
  if (!q) {
    return {
      kind: 'TRAINING',
      institution: '',
      // Nothing chosen yet; the select shows its placeholder.
      documentType: '' as DocumentTypeKey,
      series: '',
      number: '',
      topic: '',
      issuedOn: '',
      credits: '',
    };
  }
  return {
    kind: q.kind,
    institution: q.institution,
    documentType: q.documentType,
    series: q.series ?? '',
    number: q.number,
    topic: q.topic,
    issuedOn: q.issuedOn,
    credits: String(fromHundredths(q.creditsHundredths)),
  };
}

function QualificationForm({
  staffId,
  qualification,
  onStagedChange,
  onDone,
}: {
  staffId: string;
  qualification?: QualificationRow;
  /** Tells the dialog what is staged, so closing can discard it. */
  onStagedChange: (file: StagedQualificationFile | null) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  // A fresh record must be inside the last five навчальних років; an old one may
  // keep the date it has (see `issuedOnFor`).
  const keepDate = qualification?.issuedOn;
  const schema = useMemo(() => qualificationSchemaFor({ keepDate }), [keepDate]);
  const [isPending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // The scan chosen in THIS form, already in R2 and waiting for the save.
  // What the scan field last reported: undefined keeps the stored scan, null takes
  // it away, an object replaces it (`ScanChoice`).
  const [choice, setChoice] = useState<ScanChoice>(undefined);
  const [fileBusy, setFileBusy] = useState(false);
  // Bumped to remount the field after the server dropped a staged scan, so it
  // stops claiming to hold one.
  const [fileFieldKey, setFileFieldKey] = useState(0);

  function changeChoice(next: ScanChoice) {
    setChoice(next);
    // Only an object is a staged scan; null is «take the stored one away».
    onStagedChange(next && typeof next === 'object' ? next : null);
  }

  const uploader: FileUploader = {
    presign: (file) =>
      presignQualificationUpload({
        staffId,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    discard: (objectKey) => void discardQualificationUpload(staffId, objectKey),
  };

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<QualificationFormValues>({
    resolver: standardSchemaResolver(schema as never) as never,
    // Checked when a field is left, so nothing is red before it is touched.
    mode: 'onTouched',
    defaultValues: defaultsFor(qualification),
  });

  const watched = useWatch({ control });
  const documentType = (watched.documentType ?? '') as DocumentTypeKey | '';
  // The submit waits for a complete form instead of refusing afterwards with a
  // column of red (the science dialogs' rule, owner 2026-09-24).
  const complete = schema.safeParse(watched).success;

  const creditsTyped = Number(String(watched.credits ?? '').replace(',', '.'));
  const hoursNote =
    String(watched.credits ?? '').trim() !== '' &&
    Number.isFinite(creditsTyped) &&
    creditsTyped >= 0
      ? `1 кредит = ${HOURS_PER_CREDIT} годин · разом ${hoursLabel(hoursFromCredits(Math.round(creditsTyped * 100)))}`
      : `1 кредит = ${HOURS_PER_CREDIT} годин`;

  function submit() {
    setProblem(null);
    const values = getValues();

    startTransition(async () => {
      // `undefined` keeps the stored scan, `null` takes it away, an object
      // replaces it — see `QualificationInput.file`.
      const file = choice;

      const result = await attempt(() =>
        qualification
          ? updateQualification(qualification.id, { values, file })
          : createQualification({ staffId, values, file: file ?? undefined })
      );

      if ('error' in result) {
        // The server dropped the staged object on a refusal, so the picker must
        // stop claiming to hold one — except when the request never arrived:
        // then it is still there and clearing it would make somebody upload it
        // again.
        if (choice && result.error !== CONNECTION_PROBLEM) {
          changeChoice(undefined);
          setFileFieldKey((k) => k + 1);
        }
        setProblem(result.error);
        return;
      }

      toast.success(qualification ? 'Запис оновлено' : 'Запис додано');
      router.refresh();
      onDone();
    });
  }

  return (
    <RequiredFields schema={schema} alwaysMark>
      {/* `noValidate`: the schema owns every message — the browser's native
          English bubbles are refused for the same reason everywhere else. */}
      <form noValidate onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-4">
          <fieldset className="contents">
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <SegmentedControl
                  aria-label="Вид"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isPending}
                  options={QUALIFICATION_KINDS.map((k) => ({
                    value: k,
                    label: QUALIFICATION_KIND_LABELS[k],
                  }))}
                />
              )}
            />

            <FormField
              htmlFor="institution"
              label="Найменування закладу"
              error={errors.institution}
            >
              <Input
                id="institution"
                autoComplete="off"
                disabled={isPending}
                {...register('institution')}
              />
            </FormField>

            <FormField htmlFor="documentType" label="Вид документа" error={errors.documentType}>
              <Controller
                name="documentType"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <SelectTrigger
                      id="documentType"
                      className="w-full"
                      aria-invalid={!!errors.documentType}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Оберіть вид документа" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DOCUMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                htmlFor="series"
                label="Серія"
                // Optional by the schema — a довідка often has none — and the
                // star logic reads that, so only the label needs saying.
                error={errors.series}
              >
                <Input
                  id="series"
                  autoComplete="off"
                  disabled={isPending}
                  {...register('series')}
                />
              </FormField>
              <FormField htmlFor="number" label="Номер" error={errors.number}>
                <Input
                  id="number"
                  autoComplete="off"
                  disabled={isPending}
                  {...register('number')}
                />
              </FormField>
            </div>

            <FormField htmlFor="topic" label={topicLabel(documentType)} error={errors.topic}>
              <Input id="topic" autoComplete="off" disabled={isPending} {...register('topic')} />
            </FormField>

            <FormField htmlFor="issuedOn" label="Дата видачі" error={errors.issuedOn}>
              <Controller
                name="issuedOn"
                control={control}
                render={({ field }) => (
                  <DateInput
                    id="issuedOn"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    min={qualificationMinDate()}
                    max={todayInKyiv()}
                    clearable={false}
                    disabled={isPending}
                    aria-invalid={!!errors.issuedOn}
                  />
                )}
              />
            </FormField>

            <FormField
              htmlFor="credits"
              label="Кількість навчальних кредитів"
              // The hours are not asked for: they are credits × 30, shown as the
              // person types so nothing is hidden (owner, 2026-10-13).
              description={hoursNote}
              error={errors.credits}
            >
              <Input
                id="credits"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                disabled={isPending}
                {...register('credits')}
              />
            </FormField>

            <FormField
              htmlFor="qualification-file"
              label="Файл"
              required={false}
              description="Необов’язково. PDF, JPG чи PNG до 10 МБ."
            >
              <ScanField
                key={fileFieldKey}
                id="qualification-file"
                stored={qualification?.file ? { name: qualification.file.name } : null}
                uploader={uploader}
                onChange={changeChoice}
                onBusyChange={setFileBusy}
                disabled={isPending}
              />
            </FormField>
          </fieldset>
        </DialogBody>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          {/* The refusal sits WITH the submit, in the footer that does not
              scroll — see `DialogProblem`. */}
          {problem ? <DialogProblem>{problem}</DialogProblem> : <span />}
          <Button
            type="submit"
            disabled={isPending || fileBusy || !complete}
            loading={isPending || fileBusy}
          >
            {fileBusy
              ? 'Завантаження файлу…'
              : isPending
                ? 'Збереження…'
                : qualification
                  ? 'Зберегти'
                  : 'Додати'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
