'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createActivityType, updateActivityType } from '@/app/(dashboard)/admin/rating/actions';
import { EvidenceFieldBuilder } from '@/components/admin/evidence-field-builder';
import { EvidencePreview } from '@/components/admin/evidence-preview';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { ACTIVITY_KIND_LABELS, INPUT_SOURCE_LABELS } from '@/lib/rating/labels';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { specProblems, withScoringFields } from '@/validations/activity-type-spec';
import { createActivityTypeSchema, updateActivityTypeSchema } from '@/validations/rating-admin';

// One dialog for both «створити» and «редагувати»: the fields are the same, and
// keeping them together stops the two forms drifting apart.

export interface ActivityTypeDraft {
  id?: string;
  code: string;
  section: number;
  itemNumber: string;
  label: string;
  coefficient: number;
  coefficientNote: string | null;
  maxPerYear: number | null;
  inputSource: 'NPP_SUBMISSION' | 'DIVISION_MANAGED' | 'PROFILE_DERIVED';
  verifyingDivisionId: string | null;
  isActive: boolean;
  fields: EvidenceField[];
  scoring: ScoringSpec;
}

/** What each rule does, in the admin's words rather than the engine's */
const SCORING_HINTS: Record<ScoringSpec['kind'], string> = {
  FIXED: 'Кожен запис дає однакову кількість балів (коефіцієнт).',
  MULT: 'Бали = введене число × коефіцієнт.',
  SELECT: 'Бали залежать від обраного варіанта.',
  SELECT_MULT: 'Бали = бали варіанта × введена кількість.',
  GATE: 'Усе або нічого: бали лише коли всі обов’язкові прапорці підтверджено.',
};

const SCORING_KINDS: ScoringSpec['kind'][] = ['FIXED', 'MULT', 'SELECT', 'SELECT_MULT', 'GATE'];

const SECTIONS = [1, 2, 3, 4, 5];

interface ActivityTypeDialogProps {
  templateId: string;
  draft: ActivityTypeDraft;
  divisions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityTypeDialog({
  templateId,
  draft,
  divisions,
  open,
  onOpenChange,
}: ActivityTypeDialogProps) {
  const isEdit = !!draft.id;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{isEdit ? 'Редагувати показник' : 'Новий показник'}</AlertDialogTitle>
          <AlertDialogDescription>
            Зміни діють на нові подання — уже нараховані бали не перераховуються.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* key remounts the form per indicator so no state leaks between them */}
        {open && (
          <ActivityTypeForm
            key={draft.id ?? 'new'}
            templateId={templateId}
            draft={draft}
            divisions={divisions}
            onDone={() => onOpenChange(false)}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActivityTypeForm({
  templateId,
  draft,
  divisions,
  onDone,
}: {
  templateId: string;
  draft: ActivityTypeDraft;
  divisions: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const isEdit = !!draft.id;
  const [isPending, startTransition] = useTransition();

  // The specs live outside react-hook-form: they are edited by the builder, not
  // by inputs, and the resolver only ever sees their finished value.
  const [fields, setFields] = useState<EvidenceField[]>(draft.fields);
  const [scoring, setScoring] = useState<ScoringSpec>(draft.scoring);
  const [specError, setSpecError] = useState<string | null>(null);

  const schema = isEdit ? updateActivityTypeSchema : createActivityTypeSchema;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: {
      code: draft.code,
      section: draft.section,
      itemNumber: draft.itemNumber,
      label: draft.label,
      coefficient: draft.coefficient,
      coefficientNote: draft.coefficientNote ?? '',
      maxPerYear: draft.maxPerYear ?? '',
      inputSource: draft.inputSource,
      verifyingDivisionId: draft.verifyingDivisionId ?? '',
      isActive: draft.isActive,
      evidenceFields: draft.fields,
      scoring: draft.scoring,
    },
  });

  const isActive = watch('isActive');
  const inputSource = watch('inputSource') as ActivityTypeDraft['inputSource'];
  const divisionId = watch('verifyingDivisionId') as string;
  const section = String(watch('section') ?? draft.section);

  /** Rule change reshapes the form: the fields it needs appear, stale ones go */
  function onScoringChange(next: ScoringSpec) {
    const reconciled = withScoringFields(fields, next);
    setScoring(next);
    setFields(reconciled);
    setValue('scoring', next);
    setValue('evidenceFields', reconciled);
    setSpecError(null);
  }

  function onFieldsChange(next: EvidenceField[]) {
    setFields(next);
    setValue('evidenceFields', next);
    setSpecError(null);
  }

  function onSubmit(data: FieldValues) {
    // Same contract check the server runs — surfaced here so the admin sees the
    // reason next to the builder instead of as a toast from the action.
    const problems = specProblems(fields, scoring);
    if (problems.length > 0) {
      setSpecError(problems[0]);
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateActivityType(draft.id!, data as never)
        : await createActivityType(templateId, data as never);

      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Збережено');
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
        <FormField htmlFor="itemNumber" label="№ п/п" error={errors.itemNumber}>
          <Input id="itemNumber" placeholder="3.12" {...register('itemNumber')} />
        </FormField>
        <FormField htmlFor="label" label="Назва показника" error={errors.label}>
          <Textarea id="label" rows={2} {...register('label')} />
        </FormField>
      </div>

      {!isEdit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="text-sm font-medium">Розділ</span>
            <Select value={section} onValueChange={(v) => setValue('section', Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    <span className="font-medium">{s}.</span>
                    <span className="line-clamp-1">{SECTION_TITLES[s]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <FormField
            htmlFor="code"
            label="Службовий код"
            error={errors.code}
            description="Незмінний ключ показника — латиницею, напр. startup_jury"
          >
            <Input id="code" placeholder="startup_jury" {...register('code')} />
          </FormField>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Хто вносить</span>
            <Select value={inputSource} onValueChange={(v) => setValue('inputSource', v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NPP_SUBMISSION">{INPUT_SOURCE_LABELS.NPP_SUBMISSION}</SelectItem>
                <SelectItem value="DIVISION_MANAGED">
                  {INPUT_SOURCE_LABELS.DIVISION_MANAGED}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {inputSource === 'DIVISION_MANAGED' && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Відповідальний відділ</span>
            <Select
              value={divisionId || undefined}
              onValueChange={(v) => setValue('verifyingDivisionId', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Оберіть відділ" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Правило нарахування</span>
          <Select
            value={scoring.kind}
            onValueChange={(v) => onScoringChange({ ...scoring, kind: v as ScoringSpec['kind'] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCORING_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {ACTIVITY_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{SCORING_HINTS[scoring.kind]}</p>
        </div>

        {(scoring.kind === 'MULT' || scoring.kind === 'SELECT_MULT') && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={scoring.pageBased === true}
              onCheckedChange={(v) => onScoringChange({ ...scoring, pageBased: v || undefined })}
            />
            <span>
              Рахувати друковані аркуші
              <span className="block text-xs text-muted-foreground">
                сторінки ÷ 24 ÷ кількість співавторів
              </span>
            </span>
          </label>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="coefficient" label="Коефіцієнт" error={errors.coefficient}>
            <Input id="coefficient" type="number" step="any" min="0" {...register('coefficient')} />
          </FormField>
          <FormField
            htmlFor="maxPerYear"
            label="Не більше за рік"
            error={errors.maxPerYear}
            description="Порожньо — без обмеження"
          >
            <Input id="maxPerYear" type="number" min="1" step="1" {...register('maxPerYear')} />
          </FormField>
        </div>

        <div className="mt-4">
          <FormField
            htmlFor="coefficientNote"
            label="Примітка (критерії)"
            error={errors.coefficientNote}
          >
            <Textarea id="coefficientNote" rows={2} {...register('coefficientNote')} />
          </FormField>
        </div>
      </div>

      <EvidenceFieldBuilder
        fields={fields}
        scoring={scoring}
        onChange={onFieldsChange}
        error={specError ?? (errors.evidenceFields?.message as string | undefined)}
      />

      <EvidencePreview fields={fields} />

      <label className="flex cursor-pointer items-center gap-2">
        <Switch checked={!!isActive} onCheckedChange={(v) => setValue('isActive', v)} />
        <span className="text-sm">Показник активний</span>
      </label>

      <AlertDialogFooter>
        <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження…' : isEdit ? 'Зберегти' : 'Створити'}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
