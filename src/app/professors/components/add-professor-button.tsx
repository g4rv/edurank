'use client';

import { Button, Input, Modal, Select, Checkbox } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import {
  RANK_LABELS,
  POSITION_LABELS,
  DEGREE_LABELS,
} from '@/lib/professor-labels';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { createProfessor } from '../actions';
import { createProfessorSchema, type CreateProfessorValues } from '../schema';

type Department = { id: string; name: string };

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </p>
      {children}
    </div>
  );
}

export function AddProfessorButton({
  departments,
}: {
  departments: Department[];
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProfessorValues>({
    resolver: zodResolver(
      createProfessorSchema
    ) as Resolver<CreateProfessorValues>,
  });

  const onClose = () => {
    setOpen(false);
    reset();
  };

  const onSubmit = handleSubmit(async (data) => {
    const result = await createProfessor(data);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Викладача додано');
      onClose();
    }
  });

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mr-1.5"
        >
          <path d="M5 12h14M12 5v14" />
        </svg>
        Додати
      </Button>

      <Modal
        open={open}
        onClose={onClose}
        title="Додати викладача"
        size="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Скасувати
            </Button>
            <Button type="submit" form="add-professor-form" disabled={isSubmitting}>
              {isSubmitting ? 'Збереження...' : 'Зберегти'}
            </Button>
          </div>
        }
      >
        <form
          id="add-professor-form"
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-6"
        >
          {/* ── Основне ──────────────────────────────────────────── */}
          <FormSection title="Основне">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Прізвище *" error={errors.lastName?.message}>
                <Input {...register('lastName')} />
              </Field>
              <Field label="Ім'я *" error={errors.firstName?.message}>
                <Input {...register('firstName')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="По батькові" error={errors.patronymic?.message}>
                <Input {...register('patronymic')} />
              </Field>
              <Field label="Кафедра *" error={errors.departmentId?.message}>
                <Select {...register('departmentId')} defaultValue="">
                  <option value="" disabled>
                    Оберіть кафедру
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Email" error={errors.email?.message}>
              <Input {...register('email')} type="email" />
            </Field>
          </FormSection>

          {/* ── Зайнятість ───────────────────────────────────────── */}
          <FormSection title="Зайнятість">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ставка" error={errors.employmentRate?.message}>
                <Input
                  {...register('employmentRate')}
                  type="number"
                  step="0.1"
                  placeholder="0.5"
                />
              </Field>
              <Field
                label="Педагогічний стаж (років)"
                error={errors.pedagogicalExperience?.message}
              >
                <Input
                  {...register('pedagogicalExperience')}
                  type="number"
                  placeholder="0"
                />
              </Field>
            </div>
          </FormSection>

          {/* ── Академічний профіль ──────────────────────────────── */}
          <FormSection title="Академічний профіль">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Вчене звання" error={errors.academicRank?.message}>
                <Select {...register('academicRank')}>
                  <option value="">—</option>
                  {Object.entries(RANK_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Посада" error={errors.academicPosition?.message}>
                <Select {...register('academicPosition')}>
                  <option value="">—</option>
                  {Object.entries(POSITION_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Науковий ступінь"
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
              </Field>
              <Field
                label="Ступінь за спеціальністю кафедри"
                error={errors.degreeMatchesDepartment?.message}
              >
                <div className="pt-2">
                  <Checkbox {...register('degreeMatchesDepartment')}>
                    Відповідає
                  </Checkbox>
                </div>
              </Field>
            </div>
          </FormSection>

          {/* ── Профілі дослідника ───────────────────────────────── */}
          <FormSection title="Профілі дослідника">
            <Field label="ORCID iD" error={errors.orcidId?.message}>
              <Input
                {...register('orcidId')}
                placeholder="0000-0000-0000-0000"
              />
            </Field>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Field label="Web of Science URL" error={errors.wosURL?.message}>
                <Input {...register('wosURL')} type="url" />
              </Field>
              <Field
                label="Цитувань"
                error={errors.wosCitationCount?.message}
              >
                <Input
                  {...register('wosCitationCount')}
                  type="number"
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Field label="Scopus URL" error={errors.scopusURL?.message}>
                <Input {...register('scopusURL')} type="url" />
              </Field>
              <Field
                label="Цитувань"
                error={errors.scopusCitationCount?.message}
              >
                <Input
                  {...register('scopusCitationCount')}
                  type="number"
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Field
                label="Google Scholar URL"
                error={errors.googleScholarURL?.message}
              >
                <Input {...register('googleScholarURL')} type="url" />
              </Field>
              <Field
                label="Цитувань"
                error={errors.googleScholarCitationCount?.message}
              >
                <Input
                  {...register('googleScholarCitationCount')}
                  type="number"
                  placeholder="0"
                />
              </Field>
            </div>
          </FormSection>

          {/* ── Документи ────────────────────────────────────────── */}
          <FormSection title="Документи">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="ID рейтингового листа"
                error={errors.ratingSheetId?.message}
              >
                <Input {...register('ratingSheetId')} />
              </Field>
              <Field
                label="ID сертифіката"
                error={errors.certificateId?.message}
              >
                <Input {...register('certificateId')} />
              </Field>
            </div>
          </FormSection>
        </form>
      </Modal>
    </>
  );
}
