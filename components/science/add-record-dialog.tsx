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
import { Label } from '@/components/aurora/ui/label';
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
import { WorkTypeCombobox } from '@/components/science/work-type-combobox';
import { evidenceDefaults } from '@/lib/rating/evidence-fields';
import { computeScore } from '@/lib/specs/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { RequiredFields } from '@/components/ui/required-fields';
import { toHundredths, parseStake } from '@/lib/stake/units';
import { formatHours } from '@/lib/science/hours';
import { JoinWorkPanel } from '@/components/science/join-work-panel';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { EvidenceFileField, type StagedFile } from '@/components/science/evidence-file-field';
import { DialogProblem } from '@/components/science/dialog-problem';

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
 * 3. **An hours box, only for a SHARED type**, defaulting to the whole pool.
 *
 * And one thing no rating form has: a save can come back a THIRD way. When the
 * work already exists the dialog does not close and shows no red error — it
 * swaps to `JoinWorkPanel` (D17).
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
}: {
  departmentId: string;
  workTypes: PlanWorkType[];
}) {
  const [open, setOpen] = useState(false);
  // Empty by default — see the note in `add-plan-row-dialog.tsx`.
  const [typeId, setTypeId] = useState('');
  const [conflict, setConflict] = useState<WorkConflict | null>(null);

  if (workTypes.length === 0) return null;

  const selected = workTypes.find((t) => t.id === typeId);
  const picker = <WorkTypeCombobox workTypes={workTypes} value={typeId} onChange={setTypeId} />;

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      // A reopened dialog must not still be showing the last conflict, nor the
      // вид роботи that was just added — which reads as «already filled in».
      setConflict(null);
      setTypeId('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
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
              ? 'Заповніть дані роботи та додайте посилання, що її підтверджує.'
              : conflict.fromYear
                ? 'Одна робота існує в системі один раз — і належить тому навчальному році, у якому її внесли.'
                : 'Одна робота існує в системі один раз. Приєднайтеся до неї та візьміть свою частину годин.'}
          </DialogDescription>
        </DialogHeader>

        {conflict ? (
          <JoinWorkPanel
            conflict={conflict}
            departmentId={departmentId}
            onDone={() => close(false)}
            onCancel={() => setConflict(null)}
          />
        ) : (
          /* Always rendered, chosen вид роботи or not — see the note in
             `add-plan-row-dialog.tsx`. */
          <RecordForm
            key={selected?.id ?? 'none'}
            type={selected}
            departmentId={departmentId}
            onConflict={setConflict}
            onDone={() => close(false)}
            picker={picker}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  type,
  departmentId,
  onConflict,
  onDone,
  picker,
}: {
  /** `undefined` until a вид роботи is chosen — the form still draws. */
  type: PlanWorkType | undefined;
  departmentId: string;
  onConflict: (conflict: WorkConflict) => void;
  onDone: () => void;
  picker: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState('');
  const [hours, setHours] = useState('');
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
  const poolHundredths = previewHours === null ? null : toHundredths(previewHours);

  function onSubmit(data: FieldValues) {
    if (!type) return;
    setProblem(null);

    let hoursHundredths: number | undefined;
    if (shared && hours.trim()) {
      const parsed = parseStake(hours);
      if (parsed === null) {
        setProblem('Вкажіть кількість годин, наприклад 200 або 12,5');
        return;
      }
      hoursHundredths = parsed;
    }

    startTransition(async () => {
      const result = await saveRecord({
        departmentId,
        workTypeId: type.id,
        evidence: data,
        link: link.trim() || undefined,
        hoursHundredths,
        // Already uploaded; the server verifies it from the stored bytes and
        // writes its row in the same transaction as the work.
        file: file ?? undefined,
      });

      if ('conflict' in result) {
        // Not a failure — an offer. The dialog stays open and swaps its body.
        onConflict(result.conflict);
        return;
      }
      if ('error' in result) {
        // The server dropped the staged object on every refusal, so the
        // picker must stop claiming to hold one.
        if (file) setFile(null);
        setProblem(result.error);
        return;
      }

      toast.success('Роботу додано до виконаного');
      router.refresh();
      onDone();
    });
  }

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
                {type.unitNote && <p>{type.unitNote}</p>}
                {type.reportingForm && <p>Форма звітності: {type.reportingForm}</p>}
              </div>
            )}

            <EvidenceFields
              fields={fields}
              register={register}
              control={control}
              errors={errors}
              // Додаток III prices in ГОДИНАХ, not балах (D3) — the renderer is
              // the rating's and defaults to its unit.
              unitLabel="год"
            />

            <div className="space-y-1">
              <Label htmlFor="record-link">Посилання на підтвердження</Label>
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
              <p className="text-sm text-foreground-soft">
                {/* Per item, from the наказ's own «Форма звітності» column — it is
                    already seeded per work type and already ADMIN-editable, so a
                    new вид роботи gets a correct hint with no code change. */}
                {type?.reportingForm
                  ? `${type.reportingForm} — посилання на сторінку, де це опубліковано.`
                  : 'Сторінка, яку можна відкрити: DOI, сайт видання, репозитарій, наказ.'}
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="record-file">Файл підтвердження</Label>
              <EvidenceFileField
                id="record-file"
                value={file}
                onChange={setFile}
                onBusyChange={setFileBusy}
              />
              <p className="text-sm text-foreground-soft">
                {/* D27: a link proves anything with a public page; a file is for
                    a document that exists only in the person's own hands. One of
                    the two is required — which one is theirs to decide. */}
                Сертифікат, довідка або диплом — PDF, JPG чи PNG до 10 МБ. Досить або посилання, або
                файлу.
              </p>
            </div>

            {shared && (
              <div className="space-y-1">
                <Label htmlFor="record-hours">Скільки годин берете ви</Label>
                <Input
                  id="record-hours"
                  inputMode="decimal"
                  placeholder={poolHundredths === null ? 'усі' : formatHours(poolHundredths)}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
                <p className="text-sm text-foreground-soft">
                  {/* Said here because it is the only moment the person can act on
                      it — once saved, the rest is a colleague's to claim. */}
                  Залиште порожнім, щоб узяти всі години. Якщо робота у співавторстві, вкажіть свою
                  частину — решту зможуть взяти співавтори.
                </p>
              </div>
            )}

            <p className="text-sm text-foreground-soft">
              {!type ? (
                'Оберіть вид роботи, щоб побачити кількість годин'
              ) : poolHundredths !== null ? (
                <>
                  Робота варта{' '}
                  <span className="font-medium text-foreground">{formatHours(poolHundredths)}</span>{' '}
                  год
                </>
              ) : (
                'Заповніть поля, щоб побачити кількість годин'
              )}
            </p>
          </fieldset>
        </DialogBody>

        {/* The refusal sits WITH the submit, in the footer that does not
            scroll — see `DialogProblem`. */}
        <DialogFooter>
          <DialogProblem>{problem}</DialogProblem>
          <Button
            type="submit"
            disabled={isPending || fileBusy || !type}
            loading={isPending || fileBusy}
          >
            {fileBusy ? 'Завантаження файлу…' : isPending ? 'Збереження…' : 'Додати'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
