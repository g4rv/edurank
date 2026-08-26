'use client';

import { useEffect } from 'react';
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { TelInput } from '@/components/ui/tel-input';
import { FormField } from '@/components/ui/form-field';
import { OrcidInput } from '@/components/ui/orcid-input';
import { DepartmentCombobox } from '@/components/department-combobox';
import { FieldGroup } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ADMIN_POSITION_LABELS } from '@/lib/labels';
import { RatingFieldHint } from '@/components/staff/rating-field-hint';
import type { StaffDetail } from '@/lib/queries/get-staff';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import type { StakePart } from '@/lib/queries/get-stake-breakdown';
import { formatStake } from '@/lib/stake/units';

// The staff create and edit forms render exactly the same fields; only their
// defaults, submit handler and framing differ. Those fields live here so a
// label, placeholder or new column is written once instead of twice — the two
// copies had already drifted apart before this was extracted.

const ACADEMIC_RANK_OPTIONS = [
  { value: 'LECTURER', label: 'Викладач' },
  { value: 'SENIOR_LECTURER', label: 'Старший викладач' },
  { value: 'DOCENT', label: 'Доцент' },
  { value: 'PROFESSOR', label: 'Професор' },
] as const;

const SCIENTIFIC_DEGREE_OPTIONS = [
  { value: 'CANDIDATE', label: 'Кандидат наук' },
  { value: 'DOCTOR', label: 'Доктор наук' },
] as const;

const ADMIN_POSITION_OPTIONS = Object.entries(ADMIN_POSITION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** Every field as a string, which is what the inputs produce; Zod coerces on submit */
export type RawStaffFormValues = {
  lastName: string;
  firstName: string;
  patronymic: string;
  email: string;
  phone: string;
  isNpp: string;
  employmentRate: string;
  pedagogicalExperience: string;
  academicRank: string;
  scientificDegree: string;
  degreeMatchesDepartment: string;
  degreeDefenceDate: string;
  adminPosition: string;
  basicEducationMatch: string;
  basicEducationSpecialty: string;
  wosUrl: string;
  wosCitationCount: string;
  scopusUrl: string;
  scopusCitationCount: string;
  googleScholarUrl: string;
  googleScholarCitationCount: string;
  orcidId: string;
  departmentId: string;
  divisionId: string;
  partTimeDepartmentIds: string[];
};

export const EMPTY_STAFF_FORM_VALUES: RawStaffFormValues = {
  lastName: '',
  firstName: '',
  patronymic: '',
  email: '',
  phone: '',
  isNpp: 'true',
  employmentRate: '',
  pedagogicalExperience: '',
  academicRank: '',
  scientificDegree: '',
  degreeMatchesDepartment: '',
  degreeDefenceDate: '',
  adminPosition: '',
  basicEducationMatch: '',
  basicEducationSpecialty: '',
  wosUrl: '',
  wosCitationCount: '',
  scopusUrl: '',
  scopusCitationCount: '',
  googleScholarUrl: '',
  googleScholarCitationCount: '',
  orcidId: '',
  departmentId: '',
  divisionId: '',
  partTimeDepartmentIds: [],
};

/** An existing record as form strings; null becomes '' so inputs stay controlled */
export function staffToFormValues(staff: StaffDetail): RawStaffFormValues {
  const numberOrEmpty = (v: number | null | undefined) => (v != null ? String(v) : '');
  const boolOrEmpty = (v: boolean | null | undefined) =>
    v !== null && v !== undefined ? String(v) : '';
  // `<input type="date">` wants «YYYY-MM-DD», and the column holds UTC
  // midnight — sliced in UTC so the value round-trips unchanged.
  const dateOrEmpty = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : '');

  return {
    lastName: staff.lastName,
    firstName: staff.firstName,
    patronymic: staff.patronymic,
    email: staff.email,
    phone: staff.phone ?? '',
    isNpp: staff.isNpp ? 'true' : 'false',
    employmentRate: numberOrEmpty(staff.employmentRate),
    pedagogicalExperience: numberOrEmpty(staff.pedagogicalExperience),
    academicRank: staff.academicRank ?? '',
    scientificDegree: staff.scientificDegree ?? '',
    degreeMatchesDepartment: boolOrEmpty(staff.degreeMatchesDepartment),
    degreeDefenceDate: dateOrEmpty(staff.degreeDefenceDate),
    adminPosition: staff.adminPosition ?? '',
    basicEducationMatch: boolOrEmpty(staff.basicEducationMatch),
    basicEducationSpecialty: staff.basicEducationSpecialty ?? '',
    wosUrl: staff.wosUrl ?? '',
    wosCitationCount: numberOrEmpty(staff.wosCitationCount),
    scopusUrl: staff.scopusUrl ?? '',
    scopusCitationCount: numberOrEmpty(staff.scopusCitationCount),
    googleScholarUrl: staff.googleScholarUrl ?? '',
    googleScholarCitationCount: numberOrEmpty(staff.googleScholarCitationCount),
    orcidId: staff.orcidId ?? '',
    departmentId: staff.department?.id ?? '',
    divisionId: staff.division?.id ?? '',
    partTimeDepartmentIds: staff.partTimeDepartments.map((pd) => pd.department.id),
  };
}

function SectionCard({
  title,
  step,
  children,
}: {
  title: string;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
        {step && (
          <span className="font-mono text-xs font-bold text-muted-foreground/30 tabular-nums select-none">
            {step}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface StaffFormFieldsProps {
  register: UseFormRegister<RawStaffFormValues>;
  control: Control<RawStaffFormValues>;
  errors: FieldErrors<RawStaffFormValues>;
  /** Needed to clear «Додаткова кафедра» when it becomes the primary one */
  setValue: UseFormSetValue<RawStaffFormValues>;
  /**
   * What each кафедра has actually allocated this person, or `null` on a NEW
   * profile (2026-08-24).
   *
   * `null` is not «nothing allocated» — it is «there is no person yet», and it
   * is what puts the typed «Ставка» field back on the create form. Once the
   * record exists the number belongs to the heads: `saveDistribution` writes
   * `employmentRate` as the sum across both кафедри, so the edit form SHOWS it
   * per кафедра instead of asking for it. Two writers on one field is what let
   * the профіль and the розподіл disagree.
   */
  stakeBreakdown: StakePart[] | null;
  isPending: boolean;
  isAdmin: boolean;
  /**
   * May this viewer set «Додаткова кафедра»? ADMIN, or a division granted the
   * `partTimeDepartmentIds` field (owner, 2026-08-26).
   *
   * Its own flag rather than `isAdmin`, because the two answer different
   * questions: `isAdmin` still gates «Відділ», which is escalation and belongs
   * to nobody else. Сумісництво is structure — an editor placing people on the
   * right кафедри is the job, and the money it touches guards itself.
   */
  canEditPartTime: boolean;
  /** Watched isNpp — the academic and profile sections only apply to НПП */
  isNpp: boolean;
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  /** Create numbers its sections 01…05 as a progress cue; edit does not */
  numbered?: boolean;
  /** Anyone creating a record picks the type; only ADMIN may change it later */
  canEditType: boolean;
}

/**
 * What one кафедра allocated this person, under that кафедра's own select.
 *
 * Declared at module level, not inside `StaffFormFields`: a component created
 * during render is a new type on every render, so React remounts it and it
 * loses any state it holds. ESLint's `react-hooks/static-components` catches
 * this, and it caught it here.
 *
 * `breakdown === null` means a NEW profile — nothing to show, because the
 * typed «Ставка» field is doing the job instead.
 */
function AllocatedStake({
  departmentId,
  breakdown,
}: {
  departmentId: string | undefined;
  breakdown: StakePart[] | null;
}) {
  // Only the CREATE form has no ставка at all — there is no person yet.
  if (breakdown === null) return null;

  // **The slot stays even when it is empty** (owner, 2026-08-24). It used to
  // vanish until a кафедра was chosen, so «Додаткова кафедра» sat full width
  // while «Основна» was short, and choosing one made the field jump narrower
  // under the cursor. Reserving the space costs nothing and stops the row
  // resizing as somebody uses it.
  const part = departmentId?.trim()
    ? breakdown.find((p) => p.departmentId === departmentId)
    : undefined;
  return (
    <p className="w-28 shrink-0 pt-2 text-sm whitespace-nowrap">
      <span className="text-muted-foreground">Ставка: </span>
      {part ? (
        <span className="font-medium">{formatStake(part.hundredths)}</span>
      ) : (
        // Not «0,00» — a кафедра nobody has spread yet is not a кафедра paying
        // nothing, and only its завідувач can change that.
        <span
          className="text-muted-foreground"
          title="Завідувач ще не розподілив ставки цієї кафедри"
        >
          —
        </span>
      )}
    </p>
  );
}

/**
 * One кафедра row: the picker, the ставка that кафедра pays, and the факультет
 * underneath as context.
 *
 * The факультет used to be a prefix inside the control — «Факультет природничої
 * освіти — Кафедра здоров'я…» — which is longer than the field and cut the
 * кафедра off mid-word, so the one thing somebody needs to read was the one
 * thing they could not. It is context, not identity: it belongs under the
 * field, quiet, where it answers «which факультет is that?» without competing
 * (owner's sketch, 2026-08-24).
 *
 * Module level, not nested in the form: a component created during render is a
 * new type each time, so React remounts it and it loses its state.
 */
function DepartmentField({
  label,
  error,
  selected,
  breakdown,
  children,
}: {
  label: string;
  /** Structural, like `FormField` itself — an array field's error is not a plain FieldError */
  error?: { message?: string };
  selected: DepartmentOption | undefined;
  breakdown: StakePart[] | null;
  children: React.ReactNode;
}) {
  return (
    <FormField label={label} error={error}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {children}
          {selected?.faculty?.name && (
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={selected.faculty.name}
            >
              {selected.faculty.name}
            </p>
          )}
        </div>
        <AllocatedStake departmentId={selected?.id} breakdown={breakdown} />
      </div>
    </FormField>
  );
}

export function StaffFormFields({
  register,
  control,
  errors,
  setValue,
  stakeBreakdown,
  isPending,
  isAdmin,
  canEditPartTime,
  isNpp,
  departments,
  divisions,
  numbered = false,
  canEditType,
}: StaffFormFieldsProps) {
  // Each кафедра field drops whatever the other one holds, so the same кафедра
  // is never offered twice and cannot be chosen in both (owner, 2026-08-24).
  // Filtering only one way let somebody pick B as additional, then B as main,
  // and have the additional silently cleared out from under them.
  const primaryDepartmentId = useWatch({ control, name: 'departmentId' });
  const partTimeIds = useWatch({ control, name: 'partTimeDepartmentIds' });
  const additionalDepartmentId = partTimeIds?.[0] ?? '';

  const primaryOptions = departments.filter((dept) => dept.id !== additionalDepartmentId);
  const additionalOptions = departments.filter((dept) => dept.id !== primaryDepartmentId);

  const selectedPrimary = departments.find((d) => d.id === primaryDepartmentId);
  const selectedAdditional = departments.find((d) => d.id === additionalDepartmentId);

  // Picking кафедра B as the additional one and THEN making B the main one
  // would leave the form holding a value the schema refuses, with the offending
  // option no longer in the list to clear by hand.
  useEffect(() => {
    if (primaryDepartmentId && partTimeIds?.includes(primaryDepartmentId)) {
      setValue('partTimeDepartmentIds', [], { shouldDirty: true });
    }
  }, [primaryDepartmentId, partTimeIds, setValue]);

  // Numbers skip sections that are not rendered, so they always read 01, 02, 03…
  let sectionNumber = 0;
  const step = () => (numbered ? String(++sectionNumber).padStart(2, '0') : undefined);

  return (
    <>
      <SectionCard title="Основна інформація" step={step()}>
        <FieldGroup className="grid grid-cols-2 gap-4">
          <FormField htmlFor="lastName" label="Прізвище" error={errors.lastName}>
            <Input id="lastName" disabled={isPending} {...register('lastName')} />
          </FormField>
          <FormField htmlFor="firstName" label="Ім'я" error={errors.firstName}>
            <Input id="firstName" disabled={isPending} {...register('firstName')} />
          </FormField>
          <FormField htmlFor="patronymic" label="По батькові" error={errors.patronymic}>
            <Input id="patronymic" disabled={isPending} {...register('patronymic')} />
          </FormField>
          <FormField htmlFor="email" label="Email" error={errors.email}>
            <Input id="email" type="email" disabled={isPending} {...register('email')} />
          </FormField>
          <FormField htmlFor="phone" label="Телефон" error={errors.phone}>
            {/* Through a Controller, not `register`: the field rewrites what is
                typed on every keystroke, which an uncontrolled input cannot do
                without the caret jumping. */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <TelInput
                  id="phone"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isPending}
                  aria-invalid={!!errors.phone}
                />
              )}
            />
          </FormField>
          {canEditType && (
            <FormField label="Тип" error={errors.isNpp}>
              <Controller
                name="isNpp"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">НПП</SelectItem>
                      <SelectItem value="false">Адміністративний</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}
        </FieldGroup>
      </SectionCard>

      <SectionCard title="Місця роботи" step={step()}>
        <FieldGroup className="space-y-5">
          {/* One кафедра per ROW, not two across (owner's sketch, 2026-08-24).
              Side by side, the факультет prefix ate the field and the selected
              кафедра was cut off mid-word. The name alone now fills the control,
              the факультет sits under it as context, and the ставка that кафедра
              pays sits beside it — which is the question somebody opening this
              form is usually answering. */}
          <DepartmentField
            label="Основна кафедра"
            error={errors.departmentId}
            selected={selectedPrimary}
            breakdown={stakeBreakdown}
          >
            <Controller
              name="departmentId"
              control={control}
              render={({ field }) => (
                <DepartmentCombobox
                  departments={primaryOptions}
                  value={field.value?.trim() ? field.value : ''}
                  onChange={field.onChange}
                  disabled={isPending}
                  clearable
                />
              )}
            />
          </DepartmentField>

          {/* Shown to whoever may write it — the server checks the same grant,
              so an editor without it would otherwise fill in a choice that is
              dropped without a word. */}
          {canEditPartTime && (
            <DepartmentField
              label="Додаткова кафедра"
              error={errors.partTimeDepartmentIds}
              selected={selectedAdditional}
              breakdown={stakeBreakdown}
            >
              <Controller
                name="partTimeDepartmentIds"
                control={control}
                render={({ field }) => (
                  <DepartmentCombobox
                    departments={additionalOptions}
                    value={field.value[0] ?? ''}
                    onChange={(next) => field.onChange(next ? [next] : [])}
                    disabled={isPending}
                    clearable
                  />
                )}
              />
            </DepartmentField>
          )}

          {/* ADMIN only: a person's відділ decides which permissions their
              EDITOR role would carry, so the server takes it from nobody else.
              Showing the control to an editor would collect a choice that is
              then dropped without a word. */}
          {isAdmin && (
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Відділ" error={errors.divisionId}>
                <Controller
                  name="divisionId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=" ">—</SelectItem>
                        {divisions.map((div) => (
                          <SelectItem key={div.id} value={div.id}>
                            {div.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
          )}
        </FieldGroup>
      </SectionCard>

      {/* Only when CREATING somebody (2026-08-24). On an existing record the
          ставка belongs to the завідувачі — `saveDistribution` writes it as the
          sum across both кафедри — and it is shown under each кафедра above
          rather than typed here. A new person has no distribution yet, so
          somebody has to say what they were hired at. */}
      {isAdmin && stakeBreakdown === null && (
        <SectionCard title="Конфіденційно" step={step()}>
          <FormField htmlFor="employmentRate" label="Ставка" error={errors.employmentRate}>
            <Input
              id="employmentRate"
              type="number"
              step="0.25"
              min="0"
              max="2"
              placeholder="0.75"
              disabled={isPending}
              {...register('employmentRate')}
            />
          </FormField>
        </SectionCard>
      )}

      {isNpp && (
        <SectionCard title="Академічна інформація" step={step()}>
          <FieldGroup className="grid grid-cols-2 gap-4">
            <FormField
              label="Вчене звання"
              labelSuffix={<RatingFieldHint field="academicRank" />}
              error={errors.academicRank}
            >
              <Controller
                name="academicRank"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">—</SelectItem>
                      {ACADEMIC_RANK_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label="Науковий ступінь"
              labelSuffix={<RatingFieldHint field="scientificDegree" />}
              error={errors.scientificDegree}
            >
              <Controller
                name="scientificDegree"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">—</SelectItem>
                      {SCIENTIFIC_DEGREE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              htmlFor="pedagogicalExperience"
              label="Педагогічний досвід (років)"
              labelSuffix={<RatingFieldHint field="pedagogicalExperience" />}
              error={errors.pedagogicalExperience}
            >
              <Input
                id="pedagogicalExperience"
                type="number"
                min="0"
                placeholder="12"
                disabled={isPending}
                {...register('pedagogicalExperience')}
              />
            </FormField>
            <FormField
              htmlFor="degreeDefenceDate"
              label="Дата захисту дисертації"
              error={errors.degreeDefenceDate}
            >
              <Input
                id="degreeDefenceDate"
                type="date"
                disabled={isPending}
                {...register('degreeDefenceDate')}
              />
              {/* One date, for the HIGHEST degree — п.5 of the Характеристика
                  asks for a defence in the last five years, and the highest
                  degree is also the most recent one. */}
              <p className="mt-1 text-xs text-muted-foreground">
                За найвищим науковим ступенем — для характеристики (п.5)
              </p>
            </FormField>
            <FormField
              label="Ступінь відповідає кафедрі"
              labelSuffix={<RatingFieldHint field="degreeMatchesDepartment" />}
              error={errors.degreeMatchesDepartment}
            >
              <Controller
                name="degreeMatchesDepartment"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">—</SelectItem>
                      <SelectItem value="true">Так</SelectItem>
                      <SelectItem value="false">Ні</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label="Адміністративна посада"
              labelSuffix={<RatingFieldHint field="adminPosition" />}
              error={errors.adminPosition}
            >
              <Controller
                name="adminPosition"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">—</SelectItem>
                      {ADMIN_POSITION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label="Базова освіта за спеціальністю кафедри"
              labelSuffix={<RatingFieldHint field="basicEducationMatch" />}
              error={errors.basicEducationMatch}
            >
              <Controller
                name="basicEducationMatch"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">—</SelectItem>
                      <SelectItem value="true">Так</SelectItem>
                      <SelectItem value="false">Ні</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              htmlFor="basicEducationSpecialty"
              label="Спеціальність за дипломом"
              labelSuffix={<RatingFieldHint field="basicEducationSpecialty" />}
              error={errors.basicEducationSpecialty}
            >
              <Input
                id="basicEducationSpecialty"
                disabled={isPending}
                {...register('basicEducationSpecialty')}
              />
            </FormField>
          </FieldGroup>
        </SectionCard>
      )}

      {/* Not gated on isNpp: an administrative employee can hold a doctorate and
          an ORCID too. The citation counts only feed the rating for НПП — see
          syncProfileDerived — so recording them for anyone else is harmless.
          «Академічна інформація» above stays НПП-only: звання and ступінь really
          are academic-staff data. */}
      <SectionCard title="Наукові профілі" step={step()}>
        <FieldGroup className="grid grid-cols-2 gap-4">
          <FormField htmlFor="wosUrl" label="Web of Science — URL" error={errors.wosUrl}>
            <Input
              id="wosUrl"
              placeholder="https://webofscience.com/wos/author/..."
              disabled={isPending}
              {...register('wosUrl')}
            />
          </FormField>
          <FormField
            htmlFor="wosCitationCount"
            label="Web of Science — цитувань"
            labelSuffix={<RatingFieldHint field="wosCitationCount" />}
            error={errors.wosCitationCount}
          >
            <Input
              id="wosCitationCount"
              type="number"
              min="0"
              disabled={isPending}
              {...register('wosCitationCount')}
            />
          </FormField>
          <FormField htmlFor="scopusUrl" label="Scopus — URL" error={errors.scopusUrl}>
            <Input
              id="scopusUrl"
              placeholder="https://scopus.com/authid/..."
              disabled={isPending}
              {...register('scopusUrl')}
            />
          </FormField>
          <FormField
            htmlFor="scopusCitationCount"
            label="Scopus — цитувань"
            labelSuffix={<RatingFieldHint field="scopusCitationCount" />}
            error={errors.scopusCitationCount}
          >
            <Input
              id="scopusCitationCount"
              type="number"
              min="0"
              disabled={isPending}
              {...register('scopusCitationCount')}
            />
          </FormField>
          <FormField
            htmlFor="googleScholarUrl"
            label="Google Scholar — URL"
            error={errors.googleScholarUrl}
          >
            <Input
              id="googleScholarUrl"
              placeholder="https://scholar.google.com/..."
              disabled={isPending}
              {...register('googleScholarUrl')}
            />
          </FormField>
          <FormField
            htmlFor="googleScholarCitationCount"
            label="Google Scholar — цитувань"
            labelSuffix={<RatingFieldHint field="googleScholarCitationCount" />}
            error={errors.googleScholarCitationCount}
          >
            <Input
              id="googleScholarCitationCount"
              type="number"
              min="0"
              disabled={isPending}
              {...register('googleScholarCitationCount')}
            />
          </FormField>
          <FormField htmlFor="orcidId" label="ORCID" error={errors.orcidId}>
            {/* Controlled through a `Controller`, like the phone field: the mask
                reformats on every keystroke and an uncontrolled input would move
                the caret. */}
            <Controller
              name="orcidId"
              control={control}
              render={({ field }) => (
                <OrcidInput
                  id="orcidId"
                  disabled={isPending}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </FormField>
        </FieldGroup>
      </SectionCard>
    </>
  );
}
