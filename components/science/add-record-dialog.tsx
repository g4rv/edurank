'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecord, type WorkConflict } from '@/app/(dashboard)/science-plan/record-actions';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { FormField } from '@/components/ui/form-field';
import { ExecutionPeriodField } from '@/components/science/execution-period-field';
import { monthOptions, SHOW_EXECUTION_PERIOD } from '@/lib/science/execution-month';
import type { ProofRule } from '@/lib/generated/prisma/client';
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
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { typedErrors } from '@/components/science/typed-errors';
import { WorkTypeCombobox } from '@/components/science/work-type-combobox';
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';
import { splitAtLink } from '@/lib/science/field-order';
import { computeScore } from '@/lib/specs/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { RequiredFields } from '@/components/ui/required-fields';
import { toHundredths } from '@/lib/stake/units';
import { formatHours } from '@/lib/science/hours';
import { coauthorsProblem, parseCoauthorRows, type CoauthorRow } from '@/lib/science/coauthors';
import { CoauthorsField } from '@/components/science/coauthors-field';
import { ExistingWorkPanel } from '@/components/science/existing-work-panel';
import type { CoauthorCandidate } from '@/lib/queries/list-coauthor-candidates';
import { unitNote, type PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { evidenceProblem, linkHint, linkLabel } from '@/lib/science/evidence-rule';
import { EvidenceFileField, type StagedFile } from '@/components/science/evidence-file-field';
import { DialogProblem } from '@/components/science/dialog-problem';
import { attempt, CONNECTION_PROBLEM } from '@/lib/science/attempt';

/**
 * «Додати виконане» — records one work that actually happened.
 *
 * Follows `AddPlanRowDialog` closely, with four differences, each of which is
 * the difference between an intention and a fact:
 *
 * 1. **The whole `evidenceFields` set is rendered**, not `planFields`'s subset.
 *    D23 is about the PLAN — in September an article has no title. By the time
 *    it is recorded it has one, a DOI and a page count.
 * 2. **A link box**, because a record must be proved (D27). It sits outside the
 *    generated schema: the schema is a `z.strictObject` over the type's own
 *    fields, and a stray key fails it.
 * 3. **A co-authors list, only for a SHARED type** (owner, 2026-09-30): people
 *    picked from the НПП, each with the hours they get. The author's own share
 *    is what is left, so nobody ever types their own.
 *
 * And one thing no rating form has: a save can come back a THIRD way. When the
 * work already exists the dialog does not close and shows no red error — it
 * swaps to `ExistingWorkPanel`, which says who has it and tells the person to
 * agree the hours with them (D17, as amended 2026-09-30: nobody joins alone).
 *
 * **Every вид роботи is offered** (owner, 2026-09-17). The plan says what
 * somebody intended and, through that, the hours they must reach — it does not
 * limit what they may do. An НПП who planned аспіранти and published an article
 * still did the article. A record is not tied to a plan line either: план and
 * факт are compared as HOURS, broken down by пункт, which needs no link between
 * a row and a record.
 */
export function AddRecordDialog({
  departmentId,
  workTypes,
  academicYear,
  lastExecutionMonth,
  coauthorCandidates,
}: {
  departmentId: string;
  workTypes: PlanWorkType[];
  academicYear: string;
  /** The year's last month (1–8) — the month picker stops there. */
  lastExecutionMonth: number;
  /** Everybody the author may name as a co-author. */
  coauthorCandidates: CoauthorCandidate[];
}) {
  const [open, setOpen] = useState(false);
  // Empty by default — see the note in `add-plan-row-dialog.tsx`.
  const [typeId, setTypeId] = useState('');
  // Held HERE, not inside the picker: the picker renders as a child of an
  // `EvidenceForm` keyed on the chosen вид роботи, so it is remounted every
  // time that key moves and any state of its own is lost. See the note on
  // `WorkTypeCombobox`'s `item` prop.
  const [pickedItem, setPickedItem] = useState('');
  const [conflict, setConflict] = useState<WorkConflict | null>(null);

  if (workTypes.length === 0) return null;

  const selected = workTypes.find((t) => t.id === typeId);
  const picker = (
    <WorkTypeCombobox
      workTypes={workTypes}
      value={typeId}
      onChange={setTypeId}
      item={pickedItem}
      onItemChange={setPickedItem}
    />
  );

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      // A reopened dialog must not still be showing the last conflict, nor the
      // вид роботи that was just added — which reads as «already filled in».
      setConflict(null);
      setTypeId('');
      setPickedItem('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="brand">
          <Plus className="size-4" />
          Додати виконане
        </Button>
      </DialogTrigger>

      <DialogContent
        // **Do not autofocus the first field** (owner, 2026-09-17). Radix moves
        // focus to the first focusable element when a dialog opens, that is now
        // the вид роботи combobox, and a combobox opens its list on focus — so
        // the dialog appeared with its own form already covered by a 26-row
        // list nobody had asked for, and the panel behind it could not be
        // scrolled.
        //
        // Focus stays on the panel itself, which is what Radix falls back to,
        // so Tab still walks the form in order and Esc still closes it.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{conflict ? 'Робота вже є в системі' : 'Виконана робота'}</DialogTitle>
          <DialogDescription>
            {/* The description has to follow the SAME branch the panel does —
                it promised «приєднайтеся» over a work from a closed рік, which
                is the one case where joining is impossible. */}
            {!conflict
              ? 'Оберіть пункт, заповніть дані роботи та додайте підтвердження.'
              : conflict.fromYear
                ? 'Одна робота існує в системі один раз — і належить тому навчальному році, у якому її внесли.'
                : 'Одна робота існує в системі один раз. Години між співавторами розподіляє той, хто її додав.'}
          </DialogDescription>
        </DialogHeader>

        {conflict ? (
          <ExistingWorkPanel conflict={conflict} onBack={() => setConflict(null)} />
        ) : (
          /* Always rendered, chosen вид роботи or not — see the note in
             `add-plan-row-dialog.tsx`. */
          <RecordForm
            key={selected?.id ?? 'none'}
            type={selected}
            departmentId={departmentId}
            academicYear={academicYear}
            lastExecutionMonth={lastExecutionMonth}
            onConflict={setConflict}
            onDone={() => close(false)}
            picker={picker}
            coauthorCandidates={coauthorCandidates}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  type,
  departmentId,
  academicYear,
  lastExecutionMonth,
  onConflict,
  onDone,
  picker,
  coauthorCandidates,
}: {
  /** `undefined` until a вид роботи is chosen — the form still draws. */
  type: PlanWorkType | undefined;
  departmentId: string;
  academicYear: string;
  lastExecutionMonth: number;
  onConflict: (conflict: WorkConflict) => void;
  onDone: () => void;
  picker: React.ReactNode;
  coauthorCandidates: CoauthorCandidate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState('');
  // Who the work is shared with — none until the author adds a row.
  const [coauthorRows, setCoauthorRows] = useState<CoauthorRow[]>([]);
  // D41: this month by default — most work is recorded the month it happens.
  // The newest month of the year, which is the same thing while the year runs;
  // empty before it has begun, when the server would refuse any month anyway.
  const [month, setMonth] = useState(
    () => monthOptions(new Date(), academicYear, lastExecutionMonth)[0] ?? ''
  );
  // «Робота тривала кілька місяців» — null for a one-month work.
  const [started, setStarted] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The file is ALREADY in R2 by the time this is non-null — see
  // `EvidenceFileField`. The save carries its key and the server verifies the
  // stored bytes, which is what lets a record be proved by a file alone (D27).
  const [file, setFile] = useState<StagedFile | null>(null);
  // The upload runs while the form is still being filled, so «Додати» has to
  // wait for it: submitting a key R2 has not finished writing would be refused
  // as «файл не знайдено».
  const [fileBusy, setFileBusy] = useState(false);

  // The WHOLE field set this time — see the note on this component.
  const [fields] = useState(() => type?.fields ?? []);
  const [schema] = useState(() => schemaForFields(fields, type?.scoring));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    // Checked when a field is left, and only a field holding something wrong
    // shows its message — see `typedErrors` (owner, 2026-09-24).
    mode: 'onTouched',
    defaultValues: evidenceDefaults(fields),
  });

  const watched = useWatch({ control });
  const parsedPreview = schema.safeParse(watched);
  let previewHours: number | null = null;
  if (type && parsedPreview.success) {
    try {
      previewHours = computeScore(
        {
          code: type.code,
          coefficient: type.coefficient,
          scoring: type.scoring,
          evidenceFields: fields,
        },
        parsedPreview.data
      ).score;
    } catch {
      previewHours = null;
    }
  }

  const shared = type?.sharing === 'SHARED';
  const linkRule = type?.linkRule ?? 'OPTIONAL';
  const fileRule = type?.fileRule ?? 'OPTIONAL';
  const poolHundredths = previewHours === null ? null : toHundredths(previewHours);
  // The list as shares, or the one thing wrong with it. The pool is known only
  // once the fields above are valid; before that the split cannot be judged, and
  // the server checks it again in any case.
  const parsedCoauthors = shared ? parseCoauthorRows(coauthorRows) : { shares: [] };
  const coauthorProblem =
    'error' in parsedCoauthors
      ? parsedCoauthors.error
      : poolHundredths === null
        ? null
        : coauthorsProblem({
            totalHundredths: poolHundredths,
            authorStaffId: '',
            shares: parsedCoauthors.shares,
          });
  const complete =
    !!type &&
    parsedPreview.success &&
    evidenceProblem({
      linkRule,
      fileRule,
      link: link.trim() || null,
      fileCount: file ? 1 : 0,
    }) === null &&
    coauthorProblem === null;

  function onSubmit(data: FieldValues) {
    if (!type) return;
    setProblem(null);

    // Never sent when there are none: the server gives the author the whole
    // pool. Their OWN share is what the co-authors leave, so it is not an input.
    const coauthors = 'shares' in parsedCoauthors ? parsedCoauthors.shares : [];

    startTransition(async () => {
      const result = await attempt(() =>
        saveRecord({
          departmentId,
          workTypeId: type.id,
          evidence: data,
          link: link.trim() || undefined,
          coauthors: coauthors.length > 0 ? coauthors : undefined,
          // Hidden since 2026-09-24: the server stamps the save month instead.
          ...(SHOW_EXECUTION_PERIOD
            ? { executedMonth: month, startedMonth: started ?? undefined }
            : {}),
          // Already uploaded; the server verifies it from the stored bytes and
          // writes its row in the same transaction as the work.
          file: file ?? undefined,
        })
      );

      if ('conflict' in result) {
        // Not a failure — an offer. The dialog stays open and swaps its body.
        onConflict(result.conflict);
        return;
      }
      if ('error' in result) {
        // The server dropped the staged object on every refusal, so the
        // picker must stop claiming to hold one.
        // …except when the request never arrived: then the object is still
        // staged, and clearing it would make somebody upload it again.
        if (file && result.error !== CONNECTION_PROBLEM) setFile(null);
        setProblem(result.error);
        return;
      }

      toast.success('Роботу додано до виконаного');
      router.refresh();
      onDone();
    });
  }

  // The fields split around the link box: name and kind of work, the link, then
  // the details. See `lib/science/field-order.ts`.
  const { before: beforeLink, after: afterLink } = splitAtLink(fields);
  const evidenceFields = (list: EvidenceField[]) => (
    <EvidenceFields
      fields={list}
      register={register}
      control={control}
      errors={typedErrors(errors, watched)}
      // Додаток III prices in ГОДИНАХ, not балах (D3) — the renderer is the
      // rating's and defaults to its unit.
      unitLabel="год"
    />
  );

  return (
    <RequiredFields schema={schema} alwaysMark>
      {/* `noValidate`: the schema owns every message — the browser's native
          English bubbles are refused for the same reason everywhere else. */}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-4">
          {/* `display: contents` so the fieldset groups the controls without
              taking part in the flex layout (the native fieldset behaviour). */}
          <fieldset className="contents">
            {picker}

            {type && (type.unitNote || type.reportingForm) && (
              <div className="space-y-0.5 text-sm text-foreground-soft">
                {unitNote(type) && <p>{unitNote(type)}</p>}
                {type.reportingForm && <p>Форма звітності: {type.reportingForm}</p>}
              </div>
            )}

            {evidenceFields(beforeLink)}

            {/* D41/D48: for TRACKING execution, every вид роботи — not an
                article's publication date, which is its own evidence field. */}
            {SHOW_EXECUTION_PERIOD && (
              <ExecutionPeriodField
                id="record-period"
                academicYear={academicYear}
                lastMonth={lastExecutionMonth}
                finished={month}
                started={started}
                onChange={(next) => {
                  setMonth(next.finished);
                  setStarted(next.started);
                }}
              />
            )}

            {/* D47: the link and the file each follow their own rule from the
                catalogue — shown, required, or not offered at all. Neither is
                shown before a вид роботи is chosen (owner, 2026-09-23): until
                then nobody knows which proof it takes. */}
            {type && linkRule !== 'NONE' && (
              <FormField
                htmlFor="record-link"
                label={linkLabel(fileRule)}
                required={linkRule === 'REQUIRED'}
                description={linkHint(type)}
              >
                <Input
                  id="record-link"
                  inputMode="url"
                  // Plain `https://…`, never a DOI: the placeholder used to suggest
                  // one for every вид роботи, including «Керівництво аспірантами»,
                  // which is proved by a наказ (owner, 2026-09-17).
                  placeholder="https://…"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </FormField>
            )}

            {type && fileRule !== 'NONE' && (
              <FormField
                htmlFor="record-file"
                label="Файл підтвердження"
                required={fileRule === 'REQUIRED'}
                description={fileHint(linkRule, fileRule)}
              >
                <EvidenceFileField
                  id="record-file"
                  value={file}
                  onChange={setFile}
                  onBusyChange={setFileBusy}
                />
              </FormField>
            )}

            {/* The details — DOI, pages, dates — come AFTER the link, and the
                people the work is shared with come last (owner, 2026-09-30). */}
            {afterLink.length > 0 && evidenceFields(afterLink)}

            {shared && (
              <CoauthorsField
                rows={coauthorRows}
                onChange={setCoauthorRows}
                candidates={coauthorCandidates}
                poolHundredths={poolHundredths}
                problem={coauthorProblem}
              />
            )}
          </fieldset>
        </DialogBody>

        {/* The refusal sits WITH the submit, in the footer that does not
            scroll — see `DialogProblem`. */}
        {/* The hours beside the button that commits them, as in the planning
            dialog: fixed, so filling a field never shifts the form (owner,
            2026-09-24). A refusal takes their place — it is the one thing the
            person must read before pressing again. */}
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          {problem ? (
            <DialogProblem>{problem}</DialogProblem>
          ) : (
            <p className="text-sm text-foreground-soft" aria-live="polite">
              {poolHundredths !== null && (
                <>
                  Робота варта{' '}
                  <span className="text-xl font-semibold text-foreground tabular-nums">
                    {formatHours(poolHundredths)}
                  </span>{' '}
                  год
                </>
              )}
            </p>
          )}
          {/* Off until everything required is there — the fields, and the
              proof the вид роботи asks for (the server's own D27/D47 rule) —
              instead of refusing afterwards with a column of red (owner,
              2026-09-24). */}
          <Button
            type="submit"
            disabled={isPending || fileBusy || !complete}
            loading={isPending || fileBusy}
          >
            {fileBusy ? 'Завантаження файлу…' : isPending ? 'Збереження…' : 'Додати'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}

/** Under the file box. «One of the two» is said only where it is the rule —
 *  when neither side is required (D27/D47). */
function fileHint(linkRule: ProofRule, fileRule: ProofRule): string {
  const what = 'Сертифікат, довідка або диплом — PDF, JPG чи PNG до 10 МБ.';
  return linkRule === 'OPTIONAL' && fileRule === 'OPTIONAL'
    ? `${what} Досить або посилання, або файлу.`
    : what;
}
