'use client';

import { Button, Input, Select, Checkbox, FormField } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import {
  RANK_LABELS,
  POSITION_LABELS,
  DEGREE_LABELS,
} from '@/lib/professor-labels';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { createProfessor } from '../actions';
import { professorSchema, type ProfessorFormValues } from '../[id]/schema';

type Department = { id: string; name: string };

const req = (key: keyof typeof professorSchema.shape) =>
  !professorSchema.shape[key].isOptional();

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

export function AddProfessorForm({
  departments,
  onClose,
}: {
  departments: Department[];
  onClose: () => void;
}) {
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfessorFormValues>({
    resolver: zodResolver(professorSchema) as Resolver<ProfessorFormValues>,
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createProfessor(data);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Викладача додано');
      reset();
      onClose();
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* ── Основне ──────────────────────────────────────────── */}
      <FormSection title="Основне">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Прізвище"
            required={req('lastName')}
            error={errors.lastName?.message}
          >
            <Input {...register('lastName')} />
          </FormField>
          <FormField
            label="Ім'я"
            required={req('firstName')}
            error={errors.firstName?.message}
          >
            <Input {...register('firstName')} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="По батькові"
            required={req('patronymic')}
            error={errors.patronymic?.message}
          >
            <Input {...register('patronymic')} />
          </FormField>
          <FormField
            label="Email"
            required={req('email')}
            error={errors.email?.message}
          >
            <Input {...register('email')} type="email" />
          </FormField>
        </div>
        <FormField
          label="Кафедра"
          required={req('departmentId')}
          error={errors.departmentId?.message}
        >
          <Select {...register('departmentId')} defaultValue="">
            <option value="" disabled>
              Оберіть кафедру
            </option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
        </FormField>
      </FormSection>

      {/* ── Зайнятість ───────────────────────────────────────── */}
      <FormSection title="Зайнятість">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Ставка"
            required={req('employmentRate')}
            error={errors.employmentRate?.message}
          >
            <Input
              {...register('employmentRate')}
              type="number"
              step="0.1"
              placeholder="0.5"
            />
          </FormField>
          <FormField
            label="Педагогічний стаж (років)"
            required={req('pedagogicalExperience')}
            error={errors.pedagogicalExperience?.message}
          >
            <Input
              {...register('pedagogicalExperience')}
              type="number"
              placeholder="0"
            />
          </FormField>
        </div>
      </FormSection>

      {/* ── Академічний профіль ──────────────────────────────── */}
      <FormSection title="Академічний профіль">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Вчене звання"
            required={req('academicRank')}
            error={errors.academicRank?.message}
          >
            <Select {...register('academicRank')}>
              <option value="">—</option>
              {Object.entries(RANK_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Посада"
            required={req('academicPosition')}
            error={errors.academicPosition?.message}
          >
            <Select {...register('academicPosition')}>
              <option value="">—</option>
              {Object.entries(POSITION_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Науковий ступінь"
            required={req('scientificDegree')}
            error={errors.scientificDegree?.message}
          >
            <Select {...register('scientificDegree')}>
              <option value="">—</option>
              {Object.entries(DEGREE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Ступінь за спеціальністю кафедри"
            required={req('degreeMatchesDepartment')}
            error={errors.degreeMatchesDepartment?.message}
          >
            <div className="pt-2">
              <Checkbox {...register('degreeMatchesDepartment')}>
                Відповідає
              </Checkbox>
            </div>
          </FormField>
        </div>
      </FormSection>

      {/* ── Профілі дослідника ───────────────────────────────── */}
      <FormSection title="Профілі дослідника">
        <FormField
          label="ORCID iD"
          required={req('orcidId')}
          error={errors.orcidId?.message}
        >
          <Input {...register('orcidId')} placeholder="0000-0000-0000-0000" />
        </FormField>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <FormField
            label="Web of Science URL"
            required={req('wosURL')}
            error={errors.wosURL?.message}
          >
            <Input {...register('wosURL')} type="url" />
          </FormField>
          <FormField
            label="Цитувань"
            required={req('wosCitationCount')}
            error={errors.wosCitationCount?.message}
          >
            <Input
              {...register('wosCitationCount')}
              type="number"
              placeholder="0"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <FormField
            label="Scopus URL"
            required={req('scopusURL')}
            error={errors.scopusURL?.message}
          >
            <Input {...register('scopusURL')} type="url" />
          </FormField>
          <FormField
            label="Цитувань"
            required={req('scopusCitationCount')}
            error={errors.scopusCitationCount?.message}
          >
            <Input
              {...register('scopusCitationCount')}
              type="number"
              placeholder="0"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <FormField
            label="Google Scholar URL"
            required={req('googleScholarURL')}
            error={errors.googleScholarURL?.message}
          >
            <Input {...register('googleScholarURL')} type="url" />
          </FormField>
          <FormField
            label="Цитувань"
            required={req('googleScholarCitationCount')}
            error={errors.googleScholarCitationCount?.message}
          >
            <Input
              {...register('googleScholarCitationCount')}
              type="number"
              placeholder="0"
            />
          </FormField>
        </div>
      </FormSection>

      {/* ── Документи ────────────────────────────────────────── */}
      <FormSection title="Документи">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="ID рейтингового листа"
            required={req('ratingSheetId')}
            error={errors.ratingSheetId?.message}
          >
            <Input {...register('ratingSheetId')} />
          </FormField>
          <FormField
            label="ID сертифіката"
            required={req('certificateId')}
            error={errors.certificateId?.message}
          >
            <Input {...register('certificateId')} />
          </FormField>
        </div>
      </FormSection>

      {/* ── Actions ──────────────────────────────────────────── */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Скасувати
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Збереження...' : 'Зберегти'}
        </Button>
      </div>
    </form>
  );
}
