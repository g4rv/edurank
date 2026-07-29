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
import { AddFieldSelect, EvidenceFieldBuilder } from '@/components/admin/evidence-field-builder';
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
  requiresVerification: boolean;
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

/**
 * The form is long, so it is read in named parts rather than as one run of
 * inputs. A heading and a hairline carry the grouping — boxes are left to the
 * things that really are objects: a form field, and the preview.
 */
function FormSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t pt-5 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

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
      <AlertDialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <AlertDialogHeader className="border-b px-6 py-4">
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
    getValues,
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
      requiresVerification: draft.requiresVerification,
      evidenceFields: draft.fields,
      scoring: draft.scoring,
    },
  });

  const isActive = watch('isActive');
  const requiresVerification = watch('requiresVerification');
  const inputSource = watch('inputSource') as ActivityTypeDraft['inputSource'];
  const divisionId = watch('verifyingDivisionId') as string;
  const section = String(watch('section') ?? draft.section);

  /**
   * The item number is printed on the official form and orders the export, so
   * its first digit is the розділ. Moving the indicator renumbers it rather
   * than leaving «6.21» sitting in розділ 1.
   */
  function onSectionChange(value: string) {
    const next = Number(value);
    setValue('section', next);
    const current = String(getValues('itemNumber') ?? '');
    const [, ...rest] = current.split('.');
    setValue('itemNumber', rest.length > 0 ? [next, ...rest].join('.') : String(next));
  }

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
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <FormSection title="Показник" hint="Як він називається і де стоїть в офіційній формі">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <FormField htmlFor="itemNumber" label="№ п/п" error={errors.itemNumber}>
                <Input id="itemNumber" placeholder={`${section}.12`} {...register('itemNumber')} />
              </FormField>
              <FormField htmlFor="label" label="Назва показника" error={errors.label}>
                <Textarea id="label" rows={2} {...register('label')} />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="section" label="Розділ">
                <Select value={section} onValueChange={onSectionChange}>
                  <SelectTrigger id="section" className="w-full">
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
              </FormField>

              {!isEdit && (
                <FormField
                  htmlFor="code"
                  label="Службовий код"
                  error={errors.code}
                  description="Незмінний ключ показника — латиницею, напр. startup_jury"
                >
                  <Input id="code" placeholder="startup_jury" {...register('code')} />
                </FormField>
              )}

              {isEdit ? (
                // Set once at creation: the source decides where the indicator is
                // filled in, and moving it would strand the rows already entered.
                <FormField label="Хто вносить" description="Після створення не змінюється">
                  <p className="flex h-8 items-center text-sm">
                    {INPUT_SOURCE_LABELS[inputSource]}
                  </p>
                </FormField>
              ) : (
                <FormField htmlFor="inputSource" label="Хто вносить">
                  <Select value={inputSource} onValueChange={(v) => setValue('inputSource', v)}>
                    <SelectTrigger id="inputSource" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NPP_SUBMISSION">
                        {INPUT_SOURCE_LABELS.NPP_SUBMISSION}
                      </SelectItem>
                      <SelectItem value="DIVISION_MANAGED">
                        {INPUT_SOURCE_LABELS.DIVISION_MANAGED}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              {inputSource === 'DIVISION_MANAGED' && (
                <FormField htmlFor="verifyingDivisionId" label="Відповідальний відділ">
                  <Select
                    value={divisionId || undefined}
                    onValueChange={(v) => setValue('verifyingDivisionId', v)}
                  >
                    <SelectTrigger id="verifyingDivisionId" className="w-full">
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
                </FormField>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection title="Нарахування балів" hint="Скільки дає один запис і з чого це рахується">
          <div className="space-y-4">
            <FormField
              htmlFor="scoringKind"
              label="Правило нарахування"
              description={SCORING_HINTS[scoring.kind]}
            >
              <Select
                value={scoring.kind}
                onValueChange={(v) =>
                  onScoringChange({ ...scoring, kind: v as ScoringSpec['kind'] })
                }
              >
                <SelectTrigger id="scoringKind" className="w-full">
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
            </FormField>

            {(scoring.kind === 'MULT' || scoring.kind === 'SELECT_MULT') && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={scoring.pageBased === true}
                  onCheckedChange={(v) =>
                    onScoringChange({ ...scoring, pageBased: v || undefined })
                  }
                />
                <span>
                  Рахувати друковані аркуші
                  <span className="block text-xs text-muted-foreground">
                    сторінки ÷ 24 ÷ кількість співавторів
                  </span>
                </span>
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="coefficient" label="Коефіцієнт" error={errors.coefficient}>
                <Input
                  id="coefficient"
                  type="number"
                  step="any"
                  min="0"
                  {...register('coefficient')}
                />
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

            <FormField
              htmlFor="coefficientNote"
              label="Примітка (критерії)"
              error={errors.coefficientNote}
            >
              <Textarea id="coefficientNote" rows={2} {...register('coefficientNote')} />
            </FormField>
          </div>
        </FormSection>

        <FormSection
          title="Поля форми"
          hint="Що заповнюють, подаючи цей показник"
          action={<AddFieldSelect fields={fields} onChange={onFieldsChange} />}
        >
          <div className="space-y-4">
            <EvidenceFieldBuilder
              fields={fields}
              scoring={scoring}
              onChange={onFieldsChange}
              error={specError ?? (errors.evidenceFields?.message as string | undefined)}
            />
            <EvidencePreview fields={fields} />
          </div>
        </FormSection>
      </div>

      <div className="flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <Switch checked={!!isActive} onCheckedChange={(v) => setValue('isActive', v)} />
            <span className="text-sm">
              Показник активний
              {!isActive && (
                <span className="block text-xs text-muted-foreground">
                  Вимкнений показник не нараховує балів
                </span>
              )}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={!!requiresVerification}
              onCheckedChange={(v) => setValue('requiresVerification', v)}
            />
            <span className="text-sm">
              Потребує перевірки
              {!!requiresVerification && (
                <span className="block text-xs text-muted-foreground">
                  Модератор зможе позначати ці записи як перевірені; на бали не впливає
                </span>
              )}
            </span>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Збереження…' : isEdit ? 'Зберегти' : 'Створити'}
          </Button>
        </AlertDialogFooter>
      </div>
    </form>
  );
}
