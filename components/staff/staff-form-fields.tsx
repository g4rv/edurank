'use client';

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
import { WorkplacesField } from '@/components/staff/workplaces-field';
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
  /**
   * Which Staff columns this viewer's division was actually granted, or
   * `undefined` for «all of them» — ADMIN, and the CREATE form.
   *
   * Without it the edit page offered an EDITOR the whole form whatever their
   * division held, `updateStaff` silently dropped every ungranted field, and
   * the save still toasted «Збережено»: a division granted only `orcidId` could
   * retype somebody's surname, be told it worked, and leave it unchanged
   * (2026-08-27).
   *
   * The project's own rule, already applied to `partTimeDepartmentIds` and to
   * nothing else: «Pages ask `editorHasFieldGrant` so the control is offered
   * only where the save would keep it.»
   *
   * **Undefined on CREATE, deliberately.** `createStaff` says so in as many
   * words — the per-division grants govern editing an existing row, and
   * enforcing them at creation would stop an editor filling in a name they are
   * allowed to create.
   */
  editableFields?: readonly string[];
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
  editableFields,
}: StaffFormFieldsProps) {
  /**
   * Is this column outside what the viewer's division may write?
   *
   * Disabled rather than hidden: an editor is entitled to READ the whole
   * record — that is what `/staff/[id]` shows them — so removing the fields
   * would hide information they are allowed to see and make the form look
   * different per division for no stated reason. Greyed says «not yours to
   * change», which is the true statement. It is also how `canEditPartTime`
   * already behaves on «Місця роботи».
   */
  const locked = (field: string) => editableFields !== undefined && !editableFields.includes(field);
  // The two columns «Місця роботи» is a view of. `WorkplacesField` owns the
  // rules that used to live here — one кафедра cannot appear on two rows, and
  // it drops taken options from the other row's list itself.
  const primaryDepartmentId = useWatch({ control, name: 'departmentId' });
  const partTimeIds = useWatch({ control, name: 'partTimeDepartmentIds' });

  // Numbers skip sections that are not rendered, so they always read 01, 02, 03…
  let sectionNumber = 0;
  const step = () => (numbered ? String(++sectionNumber).padStart(2, '0') : undefined);

  return (
    <>
      <SectionCard title="Основна інформація" step={step()}>
        <FieldGroup className="grid grid-cols-2 gap-4">
          <FormField htmlFor="lastName" label="Прізвище" error={errors.lastName}>
            <Input
              id="lastName"
              disabled={isPending || locked('lastName')}
              {...register('lastName')}
            />
          </FormField>
          <FormField htmlFor="firstName" label="Ім'я" error={errors.firstName}>
            <Input
              id="firstName"
              disabled={isPending || locked('firstName')}
              {...register('firstName')}
            />
          </FormField>
          <FormField htmlFor="patronymic" label="По батькові" error={errors.patronymic}>
            <Input
              id="patronymic"
              disabled={isPending || locked('patronymic')}
              {...register('patronymic')}
            />
          </FormField>
          <FormField htmlFor="email" label="Email" error={errors.email}>
            <Input
              id="email"
              type="email"
              disabled={isPending || locked('email')}
              {...register('email')}
            />
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
                  disabled={isPending || locked('phone')}
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
          {/* One row per WORKPLACE (owner's sketch, 2026-08-26). «Основна» and
              «Додаткова» were two controls for one fact and could not express
              what the university needed: сумісництво is a part-time POST, so a
              person whose main job is elsewhere holds one on two кафедри and a
              full-time post on neither. Rows of the same shape can say that.

              `lib/staff/workplaces.ts` converts between this list and the two
              columns it still lives in. */}
          <WorkplacesField
            departments={departments}
            breakdown={stakeBreakdown}
            departmentId={primaryDepartmentId ?? ''}
            partTimeDepartmentIds={partTimeIds ?? []}
            canEditPartTime={canEditPartTime}
            canEditPrimary={!locked('departmentId')}
            disabled={isPending}
            error={errors.departmentId ?? errors.partTimeDepartmentIds}
            onChange={(next) => {
              setValue('departmentId', next.departmentId, { shouldDirty: true });
              setValue('partTimeDepartmentIds', next.partTimeDepartmentIds, {
                shouldDirty: true,
              });
            }}
          />

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
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || locked('academicRank')}
                  >
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
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || locked('scientificDegree')}
                  >
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
                disabled={isPending || locked('pedagogicalExperience')}
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
                disabled={isPending || locked('degreeDefenceDate')}
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
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || locked('degreeMatchesDepartment')}
                  >
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
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || locked('adminPosition')}
                  >
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
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || locked('basicEducationMatch')}
                  >
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
                disabled={isPending || locked('basicEducationSpecialty')}
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
              disabled={isPending || locked('wosUrl')}
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
              disabled={isPending || locked('wosCitationCount')}
              {...register('wosCitationCount')}
            />
          </FormField>
          <FormField htmlFor="scopusUrl" label="Scopus — URL" error={errors.scopusUrl}>
            <Input
              id="scopusUrl"
              placeholder="https://scopus.com/authid/..."
              disabled={isPending || locked('scopusUrl')}
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
              disabled={isPending || locked('scopusCitationCount')}
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
              disabled={isPending || locked('googleScholarUrl')}
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
              disabled={isPending || locked('googleScholarCitationCount')}
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
                  disabled={isPending || locked('orcidId')}
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
