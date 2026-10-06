'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { AcademicFormValues } from '@/components/staff/academic-form-values';
import { Card } from '@/components/aurora/ui/card';
import { DateInput } from '@/components/aurora/ui/date-input';
import { Input } from '@/components/aurora/ui/input';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
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
  type AcademicOption,
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
 * «Відповідає кафедрі» as a checkbox under the speciality it is about (owner,
 * 2026-10-06). Ticked is «так»; unticked stores nothing, not «ні» — rating 1.3
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
  name: 'basicEducationMatch' | 'candidateMatchesDepartment' | 'doctorMatchesDepartment';
  hint: string;
  control: Control<AcademicFormValues>;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              id={name}
              checked={field.value === 'true'}
              onCheckedChange={(checked) => field.onChange(checked === true ? 'true' : '')}
              disabled={disabled}
            />
            Відповідає кафедрі
          </label>
        )}
      />
      <RatingFieldHint field={hint} />
    </div>
  );
}

/**
 * A degree list as offered: the «уточніть галузь» key the migration gave an
 * old degree is shown only while it is the current value — nobody picks it.
 */
function degreeOptions(list: readonly AcademicOption[], unspecified: string, current: string) {
  return list.filter((o) => o.value !== unspecified || o.value === current);
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
          labelSuffix={<RatingFieldHint field="academicRank" />}
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
        <FormField label="Вчене звання" htmlFor="academicTitle" error={errors.academicTitle}>
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

/**
 * One degree: its exact name and defence date, then the diploma speciality and
 * whether it matches the кафедра — that answer is per degree (owner,
 * 2026-10-06), because rating 1.3 pays it for the degree it pays for.
 */
function DegreeBlock({
  title,
  prefix,
  list,
  unspecified,
  control,
  register,
  errors,
  isPending,
  locked,
}: {
  title: string;
  prefix: 'candidate' | 'doctor';
  list: readonly AcademicOption[];
  unspecified: string;
  control: Control<AcademicFormValues>;
  register: UseFormRegister<AcademicFormValues>;
  errors: FieldErrors<AcademicFormValues>;
  isPending: boolean;
  locked: (field: keyof AcademicFormValues) => boolean;
}) {
  const degree = `${prefix}Degree` as const;
  const specialty = `${prefix}Specialty` as const;
  const defence = `${prefix}DefenceDate` as const;
  const matches = `${prefix}MatchesDepartment` as const;
  return (
    <div className="space-y-3">
      {/* A group heading, not a field label (owner, 2026-10-06): at the label's
          own size and weight «Доктор наук» read as one more field above
          «Ступінь». See «Group heading» in docs/aurora.md §4. */}
      <h3 className="border-b pb-1.5 text-base font-semibold">{title}</h3>
      {/* One column per degree (owner, 2026-10-06): the card sets the two
          degrees side by side, so each stacks its own four fields. */}
      <FieldGroup className="flex flex-col gap-4">
        <FormField
          label="Ступінь"
          htmlFor={degree}
          labelSuffix={<RatingFieldHint field="scientificDegree" />}
          error={errors[degree]}
        >
          <Controller
            name={degree}
            control={control}
            render={({ field }) => (
              <>
                <PlainSelect
                  id={degree}
                  value={field.value}
                  onChange={field.onChange}
                  options={degreeOptions(list, unspecified, field.value)}
                  disabled={isPending || locked(degree)}
                />
                {field.value === unspecified && (
                  <p className="mt-1 text-xs text-warning">Оберіть галузь науки зі списку</p>
                )}
              </>
            )}
          />
        </FormField>
        <FormField label="Дата захисту" htmlFor={defence} error={errors[defence]}>
          <Controller
            name={defence}
            control={control}
            render={({ field }) => (
              <DateInput
                id={defence}
                value={field.value}
                onChange={field.onChange}
                min="1950-01-01"
                max="2100-12-31"
                disabled={isPending || locked(defence)}
                aria-invalid={!!errors[defence]}
              />
            )}
          />
        </FormField>
        <FormField htmlFor={specialty} label="Спеціальність за дипломом" error={errors[specialty]}>
          <Input
            id={specialty}
            disabled={isPending || locked(specialty)}
            {...register(specialty)}
          />
        </FormField>
        <MatchCheckbox
          name={matches}
          hint="degreeMatchesDepartment"
          control={control}
          disabled={isPending || locked(matches)}
        />
      </FieldGroup>
    </div>
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
  const shared = { control, register, errors, isPending, locked };
  return (
    <Card title={CARD_TITLES.education} action={action} className={className}>
      <div className="space-y-5">
        {/* Базова освіта first, as on the record (owner, 2026-10-06) */}
        <FieldGroup className="flex flex-col gap-3">
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
          <MatchCheckbox
            name="basicEducationMatch"
            hint="basicEducationMatch"
            control={control}
            disabled={isPending || locked('basicEducationMatch')}
          />
        </FieldGroup>
        {/* Two columns, доктор наук first (owner, 2026-10-06) — the same order as
            the record shows them. One column each on a phone. */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
          <DegreeBlock
            title="Доктор наук"
            prefix="doctor"
            list={DOCTOR_DEGREES}
            unspecified={UNSPECIFIED_DOCTOR}
            {...shared}
          />
          <DegreeBlock
            title="Кандидат наук / PhD"
            prefix="candidate"
            list={CANDIDATE_DEGREES}
            unspecified={UNSPECIFIED_CANDIDATE}
            {...shared}
          />
        </div>
      </div>
    </Card>
  );
}
