'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { Textarea } from '@/components/aurora/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { FormField } from '@/components/ui/form-field';
import { RequiredFields } from '@/components/ui/required-fields';
import { AddFieldSelect, EvidenceFieldBuilder } from '@/components/admin/evidence-field-builder';
import { EvidencePreview } from '@/components/admin/evidence-preview';
import { specProblems, withScoringFields } from '@/validations/activity-type-spec';
import { identityCandidates, saveWorkTypeSchema } from '@/validations/science-work-type';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/specs/scoring';
import { saveWorkType } from '@/app/(dashboard)/admin/science-plan/[id]/actions';
import type { ProofRule, ScienceReuse, ScienceSharing } from '@/lib/generated/prisma/client';
import { PROOF_RULE_LABELS } from '@/lib/labels';

// Modelled on `components/admin/activity-type-dialog.tsx` (the rating's own
// indicator editor), with the science-only columns added — `unitNote`,
// `reportingForm`, `reuse`, `sharing`, `identityFields`, `linkRule`/`fileRule` — and
// the rating's розділ / inputSource / licencePositions machinery dropped:
// Додаток III has none of those.
//
// `pageBased` is deliberately never offered here (see
// `lib/science/work-types-2027.ts`'s docstring): Додаток III prices друковані
// аркуші directly and does not divide by co-authors, which is a different
// arithmetic Stage 2 owns, not this catalogue.

export interface WorkTypeDraft {
  id?: string;
  code: string;
  itemNumber: string;
  itemTitle: string;
  shortLabel: string;
  label: string;
  coefficient: number;
  unitNote: string | null;
  reportingForm: string | null;
  reuse: ScienceReuse;
  sharing: ScienceSharing;
  identityFields: string[];
  linkRule: ProofRule;
  fileRule: ProofRule;
  maxPerYear: number | null;
  fields: EvidenceField[];
  scoring: ScoringSpec;
}

/** What each rule pays out, in the наказ's own unit — hours, not rating points. */
const SCORING_HINTS: Record<ScoringSpec['kind'], string> = {
  FIXED: 'Кожен запис дає однакову кількість годин (коефіцієнт).',
  MULT: 'Години = введене число × коефіцієнт.',
  SELECT: 'Години залежать від обраного варіанта.',
  SELECT_MULT: 'Години = години варіанта × введена кількість.',
  CHECK_SUM:
    'Сума позначених: кожен прапорець дає власні години для обраного виду роботи, рахуються лише позначені.',
};

const SCORING_KINDS: ScoringSpec['kind'][] = ['FIXED', 'MULT', 'SELECT', 'SELECT_MULT'];

const SCORING_KIND_LABELS: Record<ScoringSpec['kind'], string> = {
  FIXED: 'Фіксована кількість годин',
  MULT: 'Години × кількість',
  SELECT: 'Години за обраний варіант',
  SELECT_MULT: 'Варіант × кількість',
  CHECK_SUM: 'Сума позначених',
};

/** Rule 6 — the consequence in plain Ukrainian, never the enum name. */
const REUSE_OPTIONS: { value: ScienceReuse; label: string; hint: string }[] = [
  {
    value: 'ONCE',
    label: 'Один раз назавжди',
    hint: 'Стаття, монографія, патент — не повторюється',
  },
  {
    value: 'YEARLY',
    label: 'Щороку заново',
    hint: 'Аспірант, гурток, лабораторія — планується щороку',
  },
];

const SHARING_OPTIONS: { value: ScienceSharing; label: string; hint: string }[] = [
  {
    value: 'SHARED',
    label: 'Години діляться між співавторами',
    hint: 'Один твір, один пул годин на всіх авторів',
  },
  {
    value: 'INDIVIDUAL',
    label: 'Години належать одній особі',
    hint: 'Кожен учасник отримує повну кількість годин',
  },
];

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
          {hint && <p className="text-xs text-foreground-soft">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The наказ's Примітка / Форма звітності columns, verbatim strings a person
 * reads — not evidence, and not part of the scoring contract.
 */
function ReuseSharingPicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; hint: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/5"
        >
          <input
            type="radio"
            className="mt-0.5 accent-brand"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-foreground-soft">{o.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Rule 2, enforced by construction: identity fields can only ever be picked
 * from names the form's OWN evidence fields already carry, never typed. The
 * server still refuses a stale name (a field removed after being picked), but
 * this is what stops a typo happening in the first place.
 */
function IdentityFieldsPicker({
  fields,
  value,
  onChange,
}: {
  fields: EvidenceField[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  // Ordinary fields plus joined groups (a ПІБ in three boxes is ONE entry).
  const candidates = identityCandidates(fields);
  const known = new Set(candidates.map((c) => c.name));
  // A name once picked can vanish from the form (the field was removed) —
  // keep showing it so the admin sees exactly what will be refused on save,
  // rather than have it disappear silently from the chip row.
  const stale = value.filter((name) => !known.has(name));
  const available = candidates.filter((c) => !value.includes(c.name));

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-sm text-foreground-soft">
          Не обрано — Stage 2 звірятиме роботи за «Назва роботи», якщо воно є серед полів.
        </p>
      ) : (
        <ol className="flex flex-wrap gap-2">
          {value.map((name, i) => {
            const field = candidates.find((c) => c.name === name);
            const isStale = stale.includes(name);
            return (
              <li
                key={name}
                className={
                  isStale
                    ? 'flex items-center gap-1.5 rounded-full border border-error/40 bg-error-surface px-2.5 py-1 text-xs text-error-strong'
                    : 'flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs'
                }
              >
                <span className="text-foreground-soft">{i + 1}.</span>
                {field?.label ?? `«${name}» — такого поля вже немає`}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((n) => n !== name))}
                  aria-label={`Прибрати ${field?.label ?? name} з ідентичності`}
                  className="text-foreground-soft hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {available.length > 0 && (
        <Select value="" onValueChange={(name) => onChange([...value, name])}>
          <SelectTrigger size="sm" className="w-64">
            <SelectValue placeholder="Додати поле до ідентичності…" />
          </SelectTrigger>
          <SelectContent>
            {available.map((f) => (
              <SelectItem key={f.name} value={f.name}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

interface WorkTypeDialogProps {
  templateId: string;
  draft: WorkTypeDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkTypeDialog({ templateId, draft, open, onOpenChange }: WorkTypeDialogProps) {
  const isEdit = !!draft.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редагувати вид роботи' : 'Новий вид роботи'}</DialogTitle>
          <DialogDescription>
            Один рядок Додатка III. Зміни діють на нові плани — вже заплановані години не
            перераховуються.
          </DialogDescription>
        </DialogHeader>

        {/* key remounts the form per work type so no state leaks between them */}
        {open && (
          <WorkTypeForm
            key={draft.id ?? 'new'}
            templateId={templateId}
            draft={draft}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WorkTypeForm({
  templateId,
  draft,
  onDone,
}: {
  templateId: string;
  draft: WorkTypeDraft;
  onDone: () => void;
}) {
  const router = useRouter();
  const isEdit = !!draft.id;
  const [isPending, startTransition] = useTransition();

  // Specs, and the names built from them, live outside react-hook-form — the
  // builder edits them directly, the resolver only ever sees the finished
  // value. Exactly the rating dialog's split.
  const [fields, setFields] = useState<EvidenceField[]>(draft.fields);
  const [scoring, setScoring] = useState<ScoringSpec>(draft.scoring);
  const [identityFields, setIdentityFields] = useState<string[]>(draft.identityFields);
  const [specError, setSpecError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(
      saveWorkTypeSchema as never
    ) as unknown as Resolver<FieldValues>,
    defaultValues: {
      templateId,
      id: draft.id,
      code: draft.code,
      itemNumber: draft.itemNumber,
      itemTitle: draft.itemTitle,
      shortLabel: draft.shortLabel,
      label: draft.label,
      coefficient: draft.coefficient,
      unitNote: draft.unitNote ?? '',
      reportingForm: draft.reportingForm ?? '',
      reuse: draft.reuse,
      sharing: draft.sharing,
      identityFields: draft.identityFields,
      linkRule: draft.linkRule,
      fileRule: draft.fileRule,
      maxPerYear: draft.maxPerYear ?? '',
      evidenceFields: draft.fields,
      scoring: draft.scoring,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const reuse = watch('reuse') as ScienceReuse;
  const sharing = watch('sharing') as ScienceSharing;
  const linkRule = watch('linkRule') as ProofRule;
  const fileRule = watch('fileRule') as ProofRule;

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

  function onIdentityFieldsChange(next: string[]) {
    setIdentityFields(next);
    setValue('identityFields', next, { shouldDirty: true });
  }

  function onSubmit(data: FieldValues) {
    // The same contract the server runs (rule 1's belt) — shown here so the
    // admin sees the reason beside the builder instead of as a toast from the
    // action.
    const problems = specProblems(fields, scoring);
    if (problems.length > 0) {
      setSpecError(problems[0]);
      return;
    }

    startTransition(async () => {
      const result = await saveWorkType(data as never);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? 'Вид роботи оновлено' : 'Вид роботи створено');
      onDone();
      router.refresh();
    });
  }

  return (
    <RequiredFields schema={saveWorkTypeSchema}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-5">
          <FormSection title="Вид роботи" hint="Як він називається і де стоїть у Додатку III">
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <FormField htmlFor="itemNumber" label="№ п/п" error={errors.itemNumber}>
                <Input id="itemNumber" placeholder="4" {...register('itemNumber')} />
              </FormField>
              <FormField htmlFor="label" label="Назва" error={errors.label}>
                <Textarea id="label" rows={2} {...register('label')} />
              </FormField>
            </div>

            <FormField htmlFor="itemTitle" label="Заголовок пункту" error={errors.itemTitle}>
              <Input
                id="itemTitle"
                placeholder="Рецензування, експертна оцінка, опонування"
                {...register('itemTitle')}
              />
              <p className="mt-1 text-sm text-foreground-soft">
                Лише якщо під цим номером у Додатку III кілька видів роботи — тоді той самий
                заголовок ставиться кожному з них.
              </p>
            </FormField>

            <FormField htmlFor="shortLabel" label="Коротка назва" error={errors.shortLabel}>
              <Input id="shortLabel" placeholder="Дисертації" {...register('shortLabel')} />
              <p className="mt-1 text-sm text-foreground-soft">
                Те, що побачить НПП у другому полі після вибору пункту. Порожньо — буде повна назва.
              </p>
            </FormField>

            {!isEdit && (
              <FormField
                htmlFor="code"
                label="Службовий код"
                error={errors.code}
                description="Незмінний ключ — латиницею, напр. article. Переживає перенумерацію наказу"
                className="mt-4"
              >
                <Input id="code" placeholder="article" {...register('code')} />
              </FormField>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField
                htmlFor="unitNote"
                label="Примітка (одиниця виміру)"
                error={errors.unitNote}
                description="Друкується як є — «За 1 сторінку», «Щороку на одного аспіранта»"
              >
                <Textarea id="unitNote" rows={2} {...register('unitNote')} />
              </FormField>
              <FormField
                htmlFor="reportingForm"
                label="Форма звітності"
                error={errors.reportingForm}
                description="«Екземпляр видання», «Наказ по аспірантурі»"
              >
                <Textarea id="reportingForm" rows={2} {...register('reportingForm')} />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Нарахування годин"
            hint="Скільки дає один запис і з чого це рахується"
          >
            <div className="space-y-4">
              <FormField
                htmlFor="scoringKind"
                label="Правило нарахування"
                description={SCORING_HINTS[scoring.kind]}
              >
                <Select
                  value={scoring.kind}
                  onValueChange={(v) => onScoringChange({ kind: v as ScoringSpec['kind'] })}
                >
                  <SelectTrigger id="scoringKind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCORING_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {SCORING_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  htmlFor="coefficient"
                  label="Годин за одиницю (коефіцієнт)"
                  error={errors.coefficient}
                >
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
                  <Input
                    id="maxPerYear"
                    type="number"
                    min="1"
                    step="1"
                    {...register('maxPerYear')}
                  />
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Поля форми"
            hint="Що заповнюють, плануючи або звітуючи цим видом роботи"
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

          <FormSection
            title="Ідентичність роботи"
            hint="За якими полями Stage 2 впізнає, що це та сама робота, а не нова"
          >
            <IdentityFieldsPicker
              fields={fields}
              value={identityFields}
              onChange={onIdentityFieldsChange}
            />
            {errors.identityFields?.message && (
              <p className="mt-2 text-sm text-error">{errors.identityFields.message as string}</p>
            )}
          </FormSection>

          <FormSection title="Повторюваність та розподіл" hint="Як наказ описує цей вид роботи">
            <div className="space-y-4">
              <ReuseSharingPicker
                value={reuse}
                onChange={(v) => setValue('reuse', v, { shouldDirty: true })}
                options={REUSE_OPTIONS}
              />
              <ReuseSharingPicker
                value={sharing}
                onChange={(v) => setValue('sharing', v, { shouldDirty: true })}
                options={SHARING_OPTIONS}
              />
            </div>
          </FormSection>

          {/* D47 — two separate proofs, two separate rules. Only when neither
              is required must the НПП still give one of the two; both «не
              використовується» is refused on save. */}
          <FormSection
            title="Підтвердження"
            hint="Якщо жодне не обовʼязкове, НПП має додати хоча б одне з двох"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ProofRuleSelect
                id="work-type-link-rule"
                label="Посилання"
                value={linkRule}
                onChange={(v) => setValue('linkRule', v, { shouldDirty: true })}
              />
              <ProofRuleSelect
                id="work-type-file-rule"
                label="Файл"
                value={fileRule}
                onChange={(v) => setValue('fileRule', v, { shouldDirty: true })}
              />
            </div>
            {/* A legal choice since 2026-09-24, and worth saying out loud: the
                record form will then ask for no proof at all. */}
            {linkRule === 'NONE' && fileRule === 'NONE' && (
              <p className="mt-2 text-sm text-foreground-soft">
                Підтвердження не потрібне — запис вноситься лише з даними роботи.
              </p>
            )}
          </FormSection>
        </DialogBody>

        <DialogFooter>
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Збереження…' : isEdit ? 'Зберегти' : 'Створити'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}

const PROOF_RULES: ProofRule[] = ['REQUIRED', 'OPTIONAL', 'NONE'];

/** One side of D47's pair — the link or the file. */
function ProofRuleSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: ProofRule;
  onChange: (value: ProofRule) => void;
}) {
  return (
    <FormField htmlFor={id} label={label}>
      <Select value={value} onValueChange={(v) => onChange(v as ProofRule)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROOF_RULES.map((rule) => (
            <SelectItem key={rule} value={rule}>
              {PROOF_RULE_LABELS[rule]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
