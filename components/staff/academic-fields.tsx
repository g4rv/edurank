'use client';

import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EMPTY_DEGREE_ROW,
  type AcademicFormValues,
  type DegreeFormRow,
} from '@/components/staff/academic-form-values';
import { Card } from '@/components/aurora/ui/card';
import { DateInput } from '@/components/aurora/ui/date-input';
import { Input } from '@/components/aurora/ui/input';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { RatingFieldHint } from '@/components/staff/rating-field-hint';
import { BadgePicker } from '@/components/staff/badge-picker';
import { CARD_TITLES } from '@/components/staff/profile/cards';
import { ACADEMIC_TITLE_LABELS, ADMIN_POSITION_LABELS, STAFF_POSITION_LABELS } from '@/lib/labels';
import { offeredAdminPositions, type HeadshipPost } from '@/lib/staff/academic';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import {
  CANDIDATE_DEGREES,
  DOCTOR_DEGREES,
  HONORARY_TITLES,
  UNSPECIFIED_CANDIDATE,
  UNSPECIFIED_DOCTOR,
  anyDegreeName,
} from '@/lib/staff/academic-options';

/**
 * «Академічна інформація» and «Освіта» (owner, 2026-10-06), written once for
 * both forms that edit them: the staff record (`StaffFormFields`, ADMIN and
 * granted editors) and the НПП's own profile (`ProfileEditForm`). Both forms
 * hold these values under the same names, so both hand their own `control`
 * over cast to this shape.
 */

/** A two-column row whose labels line up — see the note in StaffFormFields */
export const FIELD_ROW = cn(
  'grid grid-cols-2 gap-x-4 gap-y-2',
  '[&>[data-slot=field]]:grid [&>[data-slot=field]]:grid-rows-subgrid [&>[data-slot=field]]:row-span-3 [&>[data-slot=field]]:gap-0',
  '[&_[data-slot=field-label]]:self-end'
);

interface CardProps {
  register: UseFormRegister<AcademicFormValues>;
  control: Control<AcademicFormValues>;
  errors: FieldErrors<AcademicFormValues>;
  isPending: boolean;
  /** A field outside what this viewer may write — greyed, still readable */
  locked?: (field: keyof AcademicFormValues) => boolean;
  className?: string;
  action?: React.ReactNode;
  /**
   * The post a кафедра or факультет gives this person by naming them — counted
   * by itself, never picked (owner, 2026-10-06). Null on a new profile.
   */
  headship?: HeadshipPost | null;
}

/**
 * Rating 1.2 is «Вчене звання» in the order, and its list mixes звання and
 * посади — so both fields feed it, the higher counting (`ratingRank`). Said on
 * both, because the rating line reading «Вчене звання: старший викладач» beside
 * an empty вчене звання looked like a mistake (owner, 2026-10-06).
 */
const RANK_NOTE = 'Зараховується вчене звання професора або доцента, а якщо його немає — посада';

const HEADSHIP_NOTE: Record<HeadshipPost, string> = {
  DEPARTMENT_HEAD: 'Завідувач кафедри — зараховано автоматично',
  DEAN: 'Декан — зараховано автоматично',
};

const entries = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** A single-choice select with «—» for none, as the rest of the form draws them */
function PlainSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value=" ">—</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * «Відповідає спеціальності кафедри» as a checkbox under the speciality it is
 * about (owner, 2026-10-06). Ticked is «так»; unticked stores nothing, not «ні» — rating 1.3
 * and 1.9 ask only whether it is so, and the record shows «—» rather than
 * claiming «Ні» for somebody who never answered.
 *
 * The label wraps the box, the one case §4 of docs/aurora.md lets a label click
 * its control; the rating hint sits outside it, so opening the hint does not
 * tick the box.
 */
function MatchCheckbox({
  name,
  hint,
  control,
  disabled,
}: {
  name: string;
  hint: string;
  control: Control<AcademicFormValues>;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Controller
        name={name as never}
        control={control}
        render={({ field }) => (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              id={name}
              checked={field.value === 'true'}
              onCheckedChange={(checked) => field.onChange(checked === true ? 'true' : '')}
              disabled={disabled}
            />
            Відповідає спеціальності кафедри
          </label>
        )}
      />
      <RatingFieldHint field={hint} />
    </div>
  );
}

export function AcademicCard({
  register,
  control,
  errors,
  isPending,
  locked = () => false,
  className,
  action,
  headship = null,
}: CardProps) {
  return (
    <Card title={CARD_TITLES.academic} action={action} className={className}>
      <FieldGroup className={FIELD_ROW}>
        <FormField
          label="Посада"
          htmlFor="position"
          labelSuffix={<RatingFieldHint field="academicRank" note={RANK_NOTE} />}
          error={errors.position}
        >
          <Controller
            name="position"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id="position"
                value={field.value}
                onChange={field.onChange}
                options={entries(STAFF_POSITION_LABELS)}
                disabled={isPending || locked('position')}
              />
            )}
          />
        </FormField>
        <FormField
          label="Вчене звання"
          htmlFor="academicTitle"
          labelSuffix={<RatingFieldHint field="academicRank" note={RANK_NOTE} />}
          error={errors.academicTitle}
        >
          <Controller
            name="academicTitle"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id="academicTitle"
                value={field.value}
                onChange={field.onChange}
                options={entries(ACADEMIC_TITLE_LABELS)}
                disabled={isPending || locked('academicTitle')}
              />
            )}
          />
        </FormField>
        <FormField
          htmlFor="pedagogicalExperience"
          label="Науково-педагогічний стаж (років)"
          labelSuffix={<RatingFieldHint field="pedagogicalExperience" />}
          error={errors.pedagogicalExperience}
        >
          <Input
            id="pedagogicalExperience"
            type="number"
            min="0"
            placeholder="12"
            disabled={isPending || locked('pedagogicalExperience')}
            {...register('pedagogicalExperience')}
          />
        </FormField>
        <div />
      </FieldGroup>

      {/* Lists of badges take the full width — a person may hold several, and
          half a card squeezed «Заслужений працівник фізичної культури і спорту
          України» into three lines. */}
      <FieldGroup className="mt-4 flex flex-col gap-4">
        <FormField
          label="Почесні звання"
          htmlFor="honoraryTitles"
          error={errors.honoraryTitles as never}
        >
          <Controller
            name="honoraryTitles"
            control={control}
            render={({ field }) => (
              <BadgePicker
                id="honoraryTitles"
                options={HONORARY_TITLES}
                value={field.value}
                onChange={field.onChange}
                disabled={isPending || locked('honoraryTitles')}
                addLabel="Додати почесне звання…"
              />
            )}
          />
        </FormField>
        {/* Several posts, one leading one at most, and a проректор holds
            nothing else (owner, 2026-10-06). The list offers only what can go
            with what is already there; the schema and the save refuse the rest. */}
        <FormField
          label="Адміністративні посади"
          htmlFor="adminPositions"
          labelSuffix={<RatingFieldHint field="adminPosition" />}
          description={headship ? HEADSHIP_NOTE[headship] : undefined}
          error={errors.adminPositions as never}
        >
          <Controller
            name="adminPositions"
            control={control}
            render={({ field }) => (
              <BadgePicker
                id="adminPositions"
                options={entries(ADMIN_POSITION_LABELS)}
                offered={offeredAdminPositions(field.value as AdminPosition[], headship)}
                value={field.value}
                onChange={field.onChange}
                disabled={isPending || locked('adminPositions')}
                addLabel="Додати посаду…"
              />
            )}
          />
        </FormField>
      </FieldGroup>
    </Card>
  );
}

/** «15.03.2021» from the stored «2021-03-15» */
const uaDay = (iso: string) => iso.split('-').reverse().join('.');

/**
 * One diploma as a card: the ступінь on the first line, then speciality, date
 * and «відповідає кафедрі» on one (owner, 2026-10-10 — a list of cards, the
 * fields themselves in a popup). A blank part is left out, not shown as «—».
 */
function DegreeCard({
  row,
  onEdit,
  onRemove,
  disabled,
}: {
  row: DegreeFormRow;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const placeholder = row.degree === UNSPECIFIED_DOCTOR || row.degree === UNSPECIFIED_CANDIDATE;
  const detail = [row.specialty.trim(), row.defenceDate ? uaDay(row.defenceDate) : ''].filter(
    Boolean
  );
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{anyDegreeName(row.degree)}</p>
        {(detail.length > 0 || row.matchesDepartment === 'true') && (
          <p className="mt-0.5 text-sm text-foreground-soft">
            {detail.join(' – ')}
            {detail.length > 0 && row.matchesDepartment === 'true' && ' – '}
            {row.matchesDepartment === 'true' && (
              <span className="inline-flex items-center gap-1">
                відповідає кафедрі
                <Check className="size-3.5 text-success" aria-hidden />
              </span>
            )}
          </p>
        )}
        {placeholder && <p className="mt-0.5 text-xs text-warning">Оберіть точний ступінь</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Редагувати ступінь"
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Прибрати ступінь"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The four fields of one diploma, in a popup. It edits a LOCAL draft and hands
 * it back with «Готово»: nothing reaches the form — let alone the database —
 * until then, and Скасувати leaves the card as it was.
 *
 * Not a nested `<form>`: the popup renders in a portal, outside the staff form,
 * and its buttons are `type="button"` so nothing in it can submit that form.
 */
type DegreeDialogState = { index: number | null; row: DegreeFormRow };

function DegreeDialog({
  state,
  onClose,
  onDone,
}: {
  /** `index` null = a new diploma; null state = closed */
  state: DegreeDialogState | null;
  onClose: () => void;
  onDone: (index: number | null, row: DegreeFormRow) => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      {/* No auto-focus: the first control is the rating hint's «i», and focusing it
          opened its tooltip over the popup the moment it appeared. */}
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Mounted only while open, so the draft starts fresh each time — from
            the card being edited, or blank — with no effect to copy it in. */}
        {state && <DegreeDialogForm state={state} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function DegreeDialogForm({
  state,
  onClose,
  onDone,
}: {
  state: DegreeDialogState;
  onClose: () => void;
  onDone: (index: number | null, row: DegreeFormRow) => void;
}) {
  const [draft, setDraft] = useState<DegreeFormRow>(state.row);
  const [problem, setProblem] = useState<string | null>(null);

  const set = (patch: Partial<DegreeFormRow>) => setDraft((d) => ({ ...d, ...patch }));
  const placeholder = draft.degree === UNSPECIFIED_DOCTOR || draft.degree === UNSPECIFIED_CANDIDATE;

  function done() {
    if (!draft.degree) {
      setProblem('Оберіть ступінь');
      return;
    }
    onDone(state.index, draft);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{state.index === null ? 'Додати ступінь' : 'Редагувати ступінь'}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="flex flex-col gap-4">
          <FormField
            label="Ступінь"
            htmlFor="degree-dialog-degree"
            labelSuffix={<RatingFieldHint field="scientificDegree" />}
            error={problem ? { message: problem } : undefined}
          >
            <Select
              value={placeholder ? '' : draft.degree || ' '}
              onValueChange={(v) => {
                set({ degree: v === ' ' ? '' : v });
                setProblem(null);
              }}
            >
              <SelectTrigger id="degree-dialog-degree" className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">—</SelectItem>
                <SelectGroup>
                  <SelectLabel>Доктор наук</SelectLabel>
                  {DOCTOR_DEGREES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Кандидат наук / PhD</SelectLabel>
                  {CANDIDATE_DEGREES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {placeholder && (
              <p className="mt-1 text-xs text-warning">Оберіть точний науковий ступінь</p>
            )}
          </FormField>
          <FormField label="Дата захисту" htmlFor="degree-dialog-date">
            <DateInput
              id="degree-dialog-date"
              value={draft.defenceDate}
              onChange={(v) => set({ defenceDate: v ?? '' })}
              min="1950-01-01"
              max="2100-12-31"
            />
          </FormField>
          <FormField htmlFor="degree-dialog-specialty" label="Спеціальність за дипломом">
            <Input
              id="degree-dialog-specialty"
              value={draft.specialty}
              onChange={(e) => set({ specialty: e.target.value })}
            />
          </FormField>
          <div className="flex items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={draft.matchesDepartment === 'true'}
                onCheckedChange={(checked) =>
                  set({ matchesDepartment: checked === true ? 'true' : '' })
                }
              />
              Відповідає спеціальності кафедри
            </label>
            <RatingFieldHint field="degreeMatchesDepartment" />
          </div>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Скасувати
        </Button>
        <Button type="button" onClick={done}>
          {state.index === null ? 'Додати' : 'Готово'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EducationCard({
  register,
  control,
  errors,
  isPending,
  locked = () => false,
  className,
  action,
}: CardProps) {
  // The diplomas as a list of cards (owner, 2026-10-10): «+ Додати освіту» and
  // the pencil open a popup with the four fields, so the form stays short however
  // many diplomas a person holds. The list is what is saved; the old two slots
  // are written from it.
  const { fields, append, update, remove } = useFieldArray({ control, name: 'degrees' });
  const [dialog, setDialog] = useState<{ index: number | null; row: DegreeFormRow } | null>(null);
  const degreesLocked = isPending || locked('degrees');

  return (
    <Card title={CARD_TITLES.education} action={action} className={className}>
      <div className="space-y-5">
        {/* Базова освіта first, as on the record: the speciality, and beside it
            whether it matches the кафедра (owner, 2026-10-10 sketch) */}
        <FieldGroup className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2">
          <FormField
            htmlFor="basicEducationSpecialty"
            label="Спеціальність базової освіти"
            labelSuffix={<RatingFieldHint field="basicEducationSpecialty" />}
            error={errors.basicEducationSpecialty}
          >
            <Input
              id="basicEducationSpecialty"
              disabled={isPending || locked('basicEducationSpecialty')}
              {...register('basicEducationSpecialty')}
            />
          </FormField>
          <div className="pb-2">
            <MatchCheckbox
              name="basicEducationMatch"
              hint="basicEducationMatch"
              control={control}
              disabled={isPending || locked('basicEducationMatch')}
            />
          </div>
        </FieldGroup>

        <div className="space-y-3">
          {fields.map((row, index) => (
            <DegreeCard
              key={row.id}
              row={row as unknown as DegreeFormRow}
              disabled={degreesLocked}
              onEdit={() => setDialog({ index, row: row as unknown as DegreeFormRow })}
              onRemove={() => remove(index)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={degreesLocked}
            onClick={() => setDialog({ index: null, row: { ...EMPTY_DEGREE_ROW } })}
          >
            <Plus className="size-4" />
            Додати освіту
          </Button>
          {typeof errors.degrees?.message === 'string' && (
            <p className="text-sm text-error">{errors.degrees.message}</p>
          )}
        </div>
      </div>

      <DegreeDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onDone={(index, row) => {
          // `row` is the draft, with the form's own `id` (RHF's) left out.
          const value = {
            degree: row.degree,
            specialty: row.specialty,
            defenceDate: row.defenceDate,
            matchesDepartment: row.matchesDepartment,
          };
          if (index === null) append(value);
          else update(index, value);
          setDialog(null);
        }}
      />
    </Card>
  );
}
