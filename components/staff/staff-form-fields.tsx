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
import { FormField } from '@/components/ui/form-field';
import { FieldGroup } from '@/components/ui/field';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
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
  isPending: boolean;
  isAdmin: boolean;
  /** Watched isNpp — the academic and profile sections only apply to НПП */
  isNpp: boolean;
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  /** Create numbers its sections 01…05 as a progress cue; edit does not */
  numbered?: boolean;
  /** Anyone creating a record picks the type; only ADMIN may change it later */
  canEditType: boolean;
}

export function StaffFormFields({
  register,
  control,
  errors,
  setValue,
  isPending,
  isAdmin,
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

  /** «Природничий факультет — Кафедра ботаніки» */
  const departmentLabel = (dept: DepartmentOption) =>
    dept.faculty?.name ? `${dept.faculty.name} — ${dept.name}` : dept.name;

  /** Matches the кафедра OR its факультет, so either half finds it */
  const departmentMatches = (dept: DepartmentOption, query: string) =>
    departmentLabel(dept).toLowerCase().includes(query.toLowerCase());

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
            <Input id="phone" disabled={isPending} {...register('phone')} />
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
        <FieldGroup className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Основна кафедра" error={errors.departmentId}>
              <Controller
                name="departmentId"
                control={control}
                render={({ field }) => {
                  const selected = departments.find((d) => d.id === field.value);
                  return (
                    // A combobox, not a select: 31 кафедри is a scroll, and
                    // typing three letters of the name or of the факультет
                    // beats hunting through it (owner, 2026-08-24).
                    <Combobox
                      items={primaryOptions}
                      value={field.value?.trim() ? field.value : ''}
                      onChange={field.onChange}
                      filter={departmentMatches}
                      displayValue={selected ? departmentLabel(selected) : ''}
                      disabled={isPending}
                    >
                      <ComboboxInput placeholder="—" clearable />
                      <ComboboxContent>
                        <ComboboxEmpty>Кафедру не знайдено</ComboboxEmpty>
                        <ComboboxList<DepartmentOption>>
                          {(dept) => (
                            <ComboboxItem key={dept.id} value={dept.id}>
                              {departmentLabel(dept)}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  );
                }}
              />
            </FormField>
            {/* Beside «Основна кафедра» because that is the shape the rule
                now has: one person, at most two кафедри (2026-08-24). ADMIN
                only — сумісництво decides who appears in a second кафедра's
                ставка grid, which is money, so an editor may see it and never
                set it. */}
            {isAdmin && (
              <FormField label="Додаткова кафедра" error={errors.partTimeDepartmentIds}>
                <Controller
                  name="partTimeDepartmentIds"
                  control={control}
                  render={({ field }) => {
                    const selected = departments.find((d) => d.id === field.value[0]);
                    return (
                      <Combobox
                        items={additionalOptions}
                        value={field.value[0] ?? ''}
                        onChange={(next) => field.onChange(next ? [next] : [])}
                        filter={departmentMatches}
                        displayValue={selected ? departmentLabel(selected) : ''}
                        disabled={isPending}
                      >
                        <ComboboxInput placeholder="—" clearable />
                        <ComboboxContent>
                          <ComboboxEmpty>Кафедру не знайдено</ComboboxEmpty>
                          <ComboboxList<DepartmentOption>>
                            {(dept) => (
                              <ComboboxItem key={dept.id} value={dept.id}>
                                {departmentLabel(dept)}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    );
                  }}
                />
              </FormField>
            )}
          </div>

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

      {isAdmin && (
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
            <Input
              id="orcidId"
              placeholder="0000-0000-0000-0000"
              disabled={isPending}
              {...register('orcidId')}
            />
          </FormField>
        </FieldGroup>
      </SectionCard>
    </>
  );
}
