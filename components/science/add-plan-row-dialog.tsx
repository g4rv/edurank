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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
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
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';
import { computeScore, type ScoringSpec } from '@/lib/specs/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { RequiredFields } from '@/components/ui/required-fields';
import { toHundredths } from '@/lib/stake/units';
import { formatHours } from '@/components/science/plan-total';

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
}

/** Item 1, item 3, item 7… — several variants of one printed line of Додаток
 *  III, in the order the catalogue's own `order` column already gave them. */
function groupByItemNumber(types: PlanWorkType[]): [string, PlanWorkType[]][] {
  const groups = new Map<string, PlanWorkType[]>();
  for (const t of types) {
    const existing = groups.get(t.itemNumber);
    if (existing) existing.push(t);
    else groups.set(t.itemNumber, [t]);
  }
  return [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

/**
 * «Додати роботу» — plans one row of Додаток III into the open academic year.
 *
 * Follows `AddAchievementForm`'s shape closely: a centred `Dialog` (not
 * `AlertDialog` — this is a task, not a decision), the picker handed INTO the
 * remounting form so `noValidate` and the submit button share one `<form>`,
 * and the field set driven entirely by the chosen type's own `evidenceFields`.
 *
 * Two things this form adds that the rating one does not need:
 *
 * - **A free-text «Примітка»** (`SciencePlanRow.note`), kept OUTSIDE the
 *   generated Zod schema and RHF's `register` — the schema is
 *   `z.strictObject` over exactly the evidence fields, and a stray key would
 *   fail validation. Its own `useState` inside `EvidenceForm`, so it still
 *   resets when the work type changes.
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
  const [typeId, setTypeId] = useState(workTypes[0]?.id ?? '');

  if (workTypes.length === 0) return null;

  const selected = workTypes.find((t) => t.id === typeId);
  const groups = groupByItemNumber(workTypes);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Plus className="size-4" />
          Додати роботу
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Нова робота</DialogTitle>
          <DialogDescription>
            Оберіть вид роботи з Додатка III, потім заповніть дані. Це намір на рік — доказів поки
            не потрібно.
          </DialogDescription>
        </DialogHeader>

        {selected && (
          <EvidenceForm
            key={selected.id}
            type={selected}
            departmentId={departmentId}
            onDone={() => setOpen(false)}
            picker={<TypePicker groups={groups} value={typeId} onChange={setTypeId} />}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «Вид роботи» — grouped by the printed item number, so the two variants of
 *  one line (e.g. «за друкований аркуш» vs «за сторінку») sit together. */
function TypePicker({
  groups,
  value,
  onChange,
}: {
  groups: [string, PlanWorkType[]][];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="work-type">Вид роботи</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="work-type" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map(([itemNumber, types]) => (
            <SelectGroup key={itemNumber}>
              <SelectLabel>Пункт {itemNumber}</SelectLabel>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="block">{t.label}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EvidenceForm({
  type,
  departmentId,
  onDone,
  picker,
}: {
  type: PlanWorkType;
  departmentId: string;
  onDone: () => void;
  picker: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  // useState initializer: fields are static for this mount (form remounts per type)
  const [schema] = useState(() => schemaForFields(type.fields, type.scoring));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: evidenceDefaults(type.fields),
  });

  const watched = useWatch({ control });
  const parsedPreview = schema.safeParse(watched);
  let previewHours: number | null = null;
  if (parsedPreview.success) {
    try {
      previewHours = computeScore(
        {
          code: type.code,
          coefficient: type.coefficient,
          scoring: type.scoring,
          evidenceFields: type.fields,
        },
        parsedPreview.data
      ).score;
    } catch {
      previewHours = null;
    }
  }

  function onSubmit(data: FieldValues) {
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

          {(type.unitNote || type.reportingForm) && (
            <div className="space-y-0.5 text-sm text-foreground-soft">
              {type.unitNote && <p>{type.unitNote}</p>}
              {type.reportingForm && <p>Форма звітності: {type.reportingForm}</p>}
            </div>
          )}

          <EvidenceFields
            fields={type.fields}
            register={register}
            control={control}
            errors={errors}
          />

          <div className="space-y-1">
            <Label htmlFor="plan-row-note">Примітка</Label>
            <Textarea
              id="plan-row-note"
              placeholder="Наприклад: стаття у Q2 з історії освіти"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <p className="text-sm text-foreground-soft">
            {previewHours !== null ? (
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
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Збереження…' : 'Додати'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
