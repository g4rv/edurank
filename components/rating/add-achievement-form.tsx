'use client';

import { useState, useTransition } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createActivity } from '@/app/(dashboard)/achievements/actions';
import { Button } from '@/components/aurora/ui/button';
import { Label } from '@/components/aurora/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
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
import type { ScoringSpec } from '@/lib/rating/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { compareItemNumbers } from '@/lib/rating/achievement-rows';
import { RequiredFields } from '@/components/ui/required-fields';

export interface SubmittableType {
  id: string;
  label: string;
  itemNumber: string;
  coefficientNote: string | null;
  fields: EvidenceField[];
  /** Needed for the rule-level checks, e.g. CHECK_SUM's «tick at least one» */
  scoring: ScoringSpec;
}

/**
 * «Додати досягнення» — a centred dialog, opened from the page header.
 *
 * **It used to expand the page** (owner, 2026-09-11). A button revealed a card
 * that pushed the list of everything already submitted down the screen, so the
 * one action and the one record fought for the same space. The dialog leaves
 * the list exactly where it is and puts the form over it.
 *
 * **Centred, not a side sheet** (owner, 2026-09-11). A sheet was built first,
 * on the argument its own docstring makes — «on /achievements you want to see
 * the row you are filling in and the ones around it». That argument is real for
 * a grid you are transcribing FROM, and wrong here: nothing in the list informs
 * what you type, because you are recording something that happened to you. So
 * the panel does not need to keep the page readable, and a centred one puts the
 * form where the eye already is instead of at one edge of a wide monitor.
 *
 * The trigger lives in the header card beside the section title, so the action
 * is where the page says what it is, not floating above the list.
 */
export function AddAchievementForm({ types: unsortedTypes }: { types: SubmittableType[] }) {
  const types = [...unsortedTypes].sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber));
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');

  if (types.length === 0) return null;

  const selected = types.find((t) => t.id === typeId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus className="size-4" />
          Додати досягнення
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Нове досягнення</DialogTitle>
          <DialogDescription>
            Оберіть показник, потім заповніть докази. Збережене зараховується одразу.
          </DialogDescription>
        </DialogHeader>

        {selected && (
          // `key` remounts the form when the indicator changes: a different
          // indicator is a different set of fields and a different schema, and
          // values typed against the old one must not survive into the new.
          //
          // The picker is handed IN rather than sitting above the form, because
          // the body scrolls and the footer does not — so the `<form>` has to
          // span both, and everything a person fills in has to be inside it.
          <EvidenceForm
            key={selected.id}
            type={selected}
            onDone={() => setOpen(false)}
            picker={<TypePicker types={types} value={typeId} onChange={setTypeId} />}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «Показник» — which indicator this submission is against. */
function TypePicker({
  types,
  value,
  onChange,
}: {
  types: SubmittableType[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="achievement-type">Показник</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="achievement-type" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {types.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <span className="font-medium text-muted-foreground">{t.itemNumber}</span>
              {/* `block`, not `line-clamp-1`. The clamp cut every label to one
                  line, which made п.3.7's «Видання монографії (українською
                  мовою)» and «(мовою країн Європейського союзу)» the same row —
                  the two differ only in their last words. The panel is capped to
                  the trigger now, so a long label wraps instead. The TRIGGER
                  still shows one line: it clamps the selected value itself, see
                  `SelectTrigger`. */}
              <span className="block">{t.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EvidenceForm({
  type,
  onDone,
  picker,
}: {
  type: SubmittableType;
  onDone: () => void;
  picker: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
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

  function onSubmit(data: FieldValues) {
    startTransition(async () => {
      const result = await createActivity(type.id, data);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(`Досягнення додано: +${result.score} балів`);
        onDone();
      }
    });
  }

  return (
    <RequiredFields schema={schema} alwaysMark>
      <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-4">
          {picker}
          {type.coefficientNote && (
            <p className="text-sm whitespace-pre-line text-foreground-soft">
              {type.coefficientNote}
            </p>
          )}
          <EvidenceFields
            fields={type.fields}
            register={register}
            control={control}
            errors={errors}
          />
        </DialogBody>
        {/* Pinned below the body, not placed after the last field: a form is as
            long as its indicator needs — two fields for one, eight for another —
            and «Подати» should never have to be found by scrolling. */}
        <DialogFooter>
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Подання…' : 'Подати'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
