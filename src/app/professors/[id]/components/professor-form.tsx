'use client';

import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfessor } from '../actions';
import { professorSchema, type ProfessorFormValues } from '../schema';
import { Input, Button, Select, Checkbox } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import { canEdit, type EditableFields } from '@/lib/field-access';

const ACADEMIC_RANK_LABELS: Record<string, string> = {
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
  SENIOR_RESEARCHER: 'Старший науковий співробітник',
};

const ACADEMIC_POSITION_LABELS: Record<string, string> = {
  ASSISTANT: 'Асистент',
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
};

const SCIENTIFIC_DEGREE_LABELS: Record<string, string> = {
  CANDIDATE: 'Кандидат наук / Доктор філософії',
  DOCTOR: 'Доктор наук',
};

// ─── Layout helpers ────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-100 px-6 py-4 text-sm font-semibold text-zinc-700">
        {title}
      </h2>
      <dl className="px-6">{children}</dl>
    </section>
  );
}

function Row({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-3">
      <dt className="w-56 shrink-0 pt-2 text-sm text-zinc-500">{label}</dt>
      <dd className="flex-1">
        {children}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </dd>
    </div>
  );
}

function DisplayValue({
  value,
}: {
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="pt-2 text-sm text-zinc-400">—</span>;
  }
  return <span className="pt-2 text-sm text-zinc-900">{value}</span>;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface ProfessorData {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  email: string | null;
  employmentRate: number | null;
  pedagogicalExperience: number | null;
  academicRank: string | null;
  academicPosition: string | null;
  scientificDegree: string | null;
  degreeMatchesDepartment: boolean | null;
  ratingSheetId: string | null;
  certificateId: string | null;
  wosURL: string | null;
  wosCitationCount: number | null;
  scopusURL: string | null;
  scopusCitationCount: number | null;
  googleScholarURL: string | null;
  googleScholarCitationCount: number | null;
  orcidId: string | null;
  department: { name: string; faculty: { name: string } };
}

// ─── Main component ───────────────────────────────────────────────────────

export default function ProfessorForm({
  professor: p,
  editableFields,
}: {
  professor: ProfessorData;
  editableFields: EditableFields;
}) {
  const toast = useToast();
  const hasAnyEditable = editableFields === 'all' || editableFields.length > 0;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfessorFormValues>({
    // Cast needed: z.coerce.number() has input type `unknown`, which conflicts
    // with react-hook-form's generic — the runtime behavior is correct.
    resolver: zodResolver(professorSchema) as Resolver<ProfessorFormValues>,
    defaultValues: {
      lastName: p.lastName,
      firstName: p.firstName,
      patronymic: p.patronymic ?? '',
      email: p.email ?? '',
      employmentRate: p.employmentRate ?? undefined,
      pedagogicalExperience: p.pedagogicalExperience ?? undefined,
      academicRank:
        (p.academicRank as ProfessorFormValues['academicRank']) ?? undefined,
      academicPosition:
        (p.academicPosition as ProfessorFormValues['academicPosition']) ??
        undefined,
      scientificDegree:
        (p.scientificDegree as ProfessorFormValues['scientificDegree']) ??
        undefined,
      degreeMatchesDepartment: p.degreeMatchesDepartment ?? false,
      ratingSheetId: p.ratingSheetId ?? '',
      certificateId: p.certificateId ?? '',
      wosURL: p.wosURL ?? '',
      wosCitationCount: p.wosCitationCount ?? undefined,
      scopusURL: p.scopusURL ?? '',
      scopusCitationCount: p.scopusCitationCount ?? undefined,
      googleScholarURL: p.googleScholarURL ?? '',
      googleScholarCitationCount: p.googleScholarCitationCount ?? undefined,
      orcidId: p.orcidId ?? '',
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateProfessor(p.id, data);
    if (result.success) {
      toast.success('Збережено');
    } else {
      toast.error(result.error);
    }
  });

  const e = (field: string) => canEdit(field, editableFields);

  const fullName = [p.lastName, p.firstName, p.patronymic]
    .filter(Boolean)
    .join(' ');

  const degreeMatchLabel =
    p.degreeMatchesDepartment === true
      ? 'Так'
      : p.degreeMatchesDepartment === false
        ? 'Ні'
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{fullName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {p.department.name} · {p.department.faculty.name}
        </p>
      </div>

      {/* ── Персональні дані ───────────────────────────────────── */}
      <Section title="Персональні дані">
        <Row label="Прізвище" error={errors.lastName?.message}>
          {e('lastName') ? (
            <Input {...register('lastName')} className="max-w-sm" />
          ) : (
            <DisplayValue value={p.lastName} />
          )}
        </Row>
        <Row label="Ім'я" error={errors.firstName?.message}>
          {e('firstName') ? (
            <Input {...register('firstName')} className="max-w-sm" />
          ) : (
            <DisplayValue value={p.firstName} />
          )}
        </Row>
        <Row label="По батькові" error={errors.patronymic?.message}>
          {e('patronymic') ? (
            <Input {...register('patronymic')} className="max-w-sm" />
          ) : (
            <DisplayValue value={p.patronymic} />
          )}
        </Row>
        <Row label="Email" error={errors.email?.message}>
          {e('email') ? (
            <Input {...register('email')} type="email" className="max-w-sm" />
          ) : (
            <DisplayValue value={p.email} />
          )}
        </Row>
      </Section>

      {/* ── Зайнятість ─────────────────────────────────────────── */}
      <Section title="Зайнятість">
        <Row label="Ставка" error={errors.employmentRate?.message}>
          {e('employmentRate') ? (
            <Input
              {...register('employmentRate')}
              type="number"
              step="0.1"
              className="max-w-sm"
            />
          ) : (
            <DisplayValue value={p.employmentRate} />
          )}
        </Row>
        <Row
          label="Педагогічний стаж (років)"
          error={errors.pedagogicalExperience?.message}
        >
          {e('pedagogicalExperience') ? (
            <Input
              {...register('pedagogicalExperience')}
              type="number"
              className="max-w-sm"
            />
          ) : (
            <DisplayValue value={p.pedagogicalExperience} />
          )}
        </Row>
      </Section>

      {/* ── Академічний профіль ────────────────────────────────── */}
      <Section title="Академічний профіль">
        <Row label="Вчене звання" error={errors.academicRank?.message}>
          {e('academicRank') ? (
            <Select {...register('academicRank')} className="max-w-sm">
              <option value="">—</option>
              {Object.entries(ACADEMIC_RANK_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <DisplayValue
              value={
                p.academicRank ? ACADEMIC_RANK_LABELS[p.academicRank] : null
              }
            />
          )}
        </Row>
        <Row label="Посада" error={errors.academicPosition?.message}>
          {e('academicPosition') ? (
            <Select {...register('academicPosition')} className="max-w-sm">
              <option value="">—</option>
              {Object.entries(ACADEMIC_POSITION_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <DisplayValue
              value={
                p.academicPosition
                  ? ACADEMIC_POSITION_LABELS[p.academicPosition]
                  : null
              }
            />
          )}
        </Row>
        <Row label="Науковий ступінь" error={errors.scientificDegree?.message}>
          {e('scientificDegree') ? (
            <Select {...register('scientificDegree')} className="max-w-sm">
              <option value="">—</option>
              {Object.entries(SCIENTIFIC_DEGREE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <DisplayValue
              value={
                p.scientificDegree
                  ? SCIENTIFIC_DEGREE_LABELS[p.scientificDegree]
                  : null
              }
            />
          )}
        </Row>
        <Row
          label="Ступінь за спеціальністю кафедри"
          error={errors.degreeMatchesDepartment?.message}
        >
          {e('degreeMatchesDepartment') ? (
            <Checkbox
              {...register('degreeMatchesDepartment')}
              className="mt-2"
            />
          ) : (
            <DisplayValue value={degreeMatchLabel} />
          )}
        </Row>
      </Section>

      {/* ── Профілі дослідника ─────────────────────────────────── */}
      <Section title="Профілі дослідника">
        <Row label="ORCID iD" error={errors.orcidId?.message}>
          {e('orcidId') ? (
            <Input
              {...register('orcidId')}
              placeholder="0000-0000-0000-0000"
              className="max-w-sm"
            />
          ) : (
            <DisplayValue value={p.orcidId} />
          )}
        </Row>
        <Row label="Web of Science" error={errors.wosURL?.message}>
          {e('wosURL') ? (
            <Input {...register('wosURL')} type="url" className="max-w-lg" />
          ) : (
            <DisplayValue value={p.wosURL} />
          )}
        </Row>
        <Row label="Цитувань у WoS" error={errors.wosCitationCount?.message}>
          {e('wosCitationCount') ? (
            <Input
              {...register('wosCitationCount')}
              type="number"
              className="max-w-sm"
            />
          ) : (
            <DisplayValue value={p.wosCitationCount} />
          )}
        </Row>
        <Row label="Scopus" error={errors.scopusURL?.message}>
          {e('scopusURL') ? (
            <Input {...register('scopusURL')} type="url" className="max-w-lg" />
          ) : (
            <DisplayValue value={p.scopusURL} />
          )}
        </Row>
        <Row
          label="Цитувань у Scopus"
          error={errors.scopusCitationCount?.message}
        >
          {e('scopusCitationCount') ? (
            <Input
              {...register('scopusCitationCount')}
              type="number"
              className="max-w-sm"
            />
          ) : (
            <DisplayValue value={p.scopusCitationCount} />
          )}
        </Row>
        <Row label="Google Scholar" error={errors.googleScholarURL?.message}>
          {e('googleScholarURL') ? (
            <Input
              {...register('googleScholarURL')}
              type="url"
              className="max-w-lg"
            />
          ) : (
            <DisplayValue value={p.googleScholarURL} />
          )}
        </Row>
        <Row
          label="Цитувань у Google Scholar"
          error={errors.googleScholarCitationCount?.message}
        >
          {e('googleScholarCitationCount') ? (
            <Input
              {...register('googleScholarCitationCount')}
              type="number"
              className="max-w-sm"
            />
          ) : (
            <DisplayValue value={p.googleScholarCitationCount} />
          )}
        </Row>
      </Section>

      {/* ── Документи ──────────────────────────────────────────── */}
      <Section title="Документи">
        <Row
          label="ID рейтингового листа"
          error={errors.ratingSheetId?.message}
        >
          {e('ratingSheetId') ? (
            <Input {...register('ratingSheetId')} className="max-w-sm" />
          ) : (
            <DisplayValue value={p.ratingSheetId} />
          )}
        </Row>
        <Row label="ID сертифіката" error={errors.certificateId?.message}>
          {e('certificateId') ? (
            <Input {...register('certificateId')} className="max-w-sm" />
          ) : (
            <DisplayValue value={p.certificateId} />
          )}
        </Row>
      </Section>

      {hasAnyEditable && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Збереження...' : 'Зберегти'}
          </Button>
        </div>
      )}
    </form>
  );
}
