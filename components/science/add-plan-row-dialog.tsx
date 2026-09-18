'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { savePlanRow } from '@/app/(dashboard)/science-plan/actions';
import { Button } from '@/components/aurora/ui/button';
import { Label } from '@/components/aurora/ui/label';
import { Textarea } from '@/components/aurora/ui/textarea';
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
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';
import { planFields } from '@/lib/science/plan-fields';
import { computeScore, type ScoringSpec } from '@/lib/specs/scoring';
import type { ScienceSharing } from '@/lib/generated/prisma/client';
import { schemaForFields } from '@/validations/activity-evidence';
import { RequiredFields } from '@/components/ui/required-fields';
import { toHundredths } from '@/lib/stake/units';
import { formatHours } from '@/lib/science/hours';

export interface PlanWorkType {
  id: string;
  code: string;
  label: string;
  itemNumber: string;
  coefficient: number;
  unitNote: string | null;
  reportingForm: string | null;
  fields: EvidenceField[];
  scoring: ScoringSpec;
  /** A SHARED work's hours are a pool its co-authors divide (D14); an
   *  INDIVIDUAL one's are not, so the record form shows no hours box. */
  sharing: ScienceSharing;
  /** «A link alone is not enough for this type» (D27). */
  requiresFile: boolean;
}

/**
 * «Додати роботу» — plans one row of Додаток III into the open academic year.
 *
 * Follows `AddAchievementForm`'s shape closely: a centred `Dialog` (not
 * `AlertDialog` — this is a task, not a decision), the picker handed INTO the
 * remounting form so `noValidate` and the submit button share one `<form>`,
 * and the field set driven by the chosen type — but only the SUBSET
 * `planFields` picks out of its `evidenceFields` (D23,
 * `docs/superpowers/specs/2026-09-15-science-plan-design.md`). A plan row is
 * an intention, not a record: no `title`, no bibliography, no colleague's
 * ПІБ — those describe work that exists, and in September it does not yet.
 * The whole `evidenceFields` set is what a RECORD asks for, and records are
 * Stage 2.
 *
 * Two things this form adds that the rating one does not need:
 *
 * - **A free-text description** (`SciencePlanRow.note`), kept OUTSIDE the
 *   generated Zod schema and RHF's `register` — the schema is
 *   `z.strictObject` over exactly the planning fields, and a stray key would
 *   fail validation. Its own `useState` inside `EvidenceForm`, so it still
 *   resets when the work type changes. With evidence gone, this is now the
 *   form's only free-text box — the one place to say WHAT the two planned
 *   articles are about.
 * - **A live hours preview**, computed on every keystroke with the same
 *   `computeScore` the server uses. It only shows once the typed values
 *   already pass the type's own schema — an incomplete form shows nothing
 *   rather than a number computed from blanks.
 */
export function AddPlanRowDialog({
  departmentId,
  workTypes,
}: {
  departmentId: string;
  workTypes: PlanWorkType[];
}) {
  const [open, setOpen] = useState(false);
  // **Empty by default** (owner, 2026-09-17). Pre-selecting the first work type
  // made the list open already pointing at a row, so it scrolled and settled to
  // that row on every open — which reads as a flicker. It also said «this is
  // filled in» about a choice nobody had made.
  const [typeId, setTypeId] = useState('');

  if (workTypes.length === 0) return null;

  const selected = workTypes.find((t) => t.id === typeId);
  const picker = <WorkTypeCombobox workTypes={workTypes} value={typeId} onChange={setTypeId} />;

  /** Back to the first type on close. Without this the dialog reopens showing
   *  whatever was added last, which reads as «this is already filled in» and
   *  quietly invites a duplicate row (owner, 2026-09-17). */
  function close(next: boolean) {
    setOpen(next);
    if (!next) setTypeId('');
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Plus className="size-4" />
          Додати роботу
        </Button>
      </DialogTrigger>

      <DialogContent
        // Radix focuses the first field when a dialog opens; the вид роботи
        // combobox opens its list on focus, so the dialog appeared with its
        // own form already covered by a 26-row list nobody asked for.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Нова робота</DialogTitle>
          <DialogDescription>
            Оберіть вид роботи з Додатка III, потім заповніть дані. Це намір на рік — доказів поки
            не потрібно.
          </DialogDescription>
        </DialogHeader>

        {/* Always rendered, with or without a chosen вид роботи. Hiding it
            until one was picked left a tall empty dialog with a single field
            floating in it (owner, 2026-09-17) — and the form's own shape is
            what tells somebody what they are about to fill in. */}
        <EvidenceForm
          key={selected?.id ?? 'none'}
          type={selected}
          departmentId={departmentId}
          onDone={() => close(false)}
          picker={picker}
        />
      </DialogContent>
    </Dialog>
  );
}

function EvidenceForm({
  type,
  departmentId,
  onDone,
  picker,
}: {
  /** `undefined` until a вид роботи is chosen — the form still draws. */
  type: PlanWorkType | undefined;
  departmentId: string;
  onDone: () => void;
  picker: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  // useState initializer: fields are static for this mount (form remounts per
  // type). The PLANNING subset only — never `type.fields` whole, that is a
  // RECORD's field set (Stage 2).
  // The form remounts per вид роботи (`key`), so these are fixed for this
  // mount. Nothing chosen = no fields and a schema over nothing, which parses
  // an empty object — so the preview simply stays silent rather than erroring.
  const [fields] = useState(() =>
    type ? planFields({ scoring: type.scoring, evidenceFields: type.fields }) : []
  );
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

  function onSubmit(data: FieldValues) {
    if (!type) return;
    startTransition(async () => {
      const result = await savePlanRow({
        departmentId,
        workTypeId: type.id,
        details: data,
        note: note.trim() || undefined,
      });
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success('Роботу додано до плану');
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <RequiredFields schema={schema} alwaysMark>
      {/* `noValidate`: the schema owns every message — see `EvidenceFields`'s
          own note on why the browser's native English bubbles are refused. */}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-4">
          {picker}

          {type && (type.unitNote || type.reportingForm) && (
            <div className="space-y-0.5 text-sm text-foreground-soft">
              {type.unitNote && <p>{type.unitNote}</p>}
              {type.reportingForm && <p>Форма звітності: {type.reportingForm}</p>}
            </div>
          )}

          <EvidenceFields fields={fields} register={register} control={control} errors={errors} />

          <div className="space-y-1">
            <Label htmlFor="plan-row-note">Опис (необов&apos;язково)</Label>
            <Textarea
              id="plan-row-note"
              placeholder="Наприклад: стаття з історії освіти у виданні категорії Б"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <p className="text-sm text-foreground-soft">
            {!type ? (
              'Оберіть вид роботи, щоб побачити орієнтовну кількість годин'
            ) : previewHours !== null ? (
              <>
                Орієнтовно:{' '}
                <span className="font-medium text-foreground">
                  {formatHours(toHundredths(previewHours))}
                </span>{' '}
                год
              </>
            ) : (
              'Заповніть поля, щоб побачити орієнтовну кількість годин'
            )}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" disabled={isPending || !type} loading={isPending}>
            {isPending ? 'Збереження…' : 'Додати'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
