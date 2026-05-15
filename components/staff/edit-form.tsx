'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { FieldGroup } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { staffUpdateSchema, type StaffUpdateSchema } from '@/validations/staff';
import { updateStaff } from '@/app/(dashboard)/staff/[id]/actions';
import type { StaffDetail } from '@/lib/queries/get-staff';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';

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

type RawFormValues = {
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

function toFormValues(staff: StaffDetail): RawFormValues {
  return {
    lastName: staff.lastName,
    firstName: staff.firstName,
    patronymic: staff.patronymic,
    email: staff.email,
    phone: staff.phone ?? '',
    isNpp: staff.isNpp ? 'true' : 'false',
    employmentRate: staff.employmentRate !== null ? String(staff.employmentRate) : '',
    pedagogicalExperience:
      staff.pedagogicalExperience !== null ? String(staff.pedagogicalExperience) : '',
    academicRank: staff.academicRank ?? '',
    scientificDegree: staff.scientificDegree ?? '',
    degreeMatchesDepartment:
      staff.degreeMatchesDepartment !== null ? String(staff.degreeMatchesDepartment) : '',
    wosUrl: staff.wosUrl ?? '',
    wosCitationCount: staff.wosCitationCount !== null ? String(staff.wosCitationCount) : '',
    scopusUrl: staff.scopusUrl ?? '',
    scopusCitationCount:
      staff.scopusCitationCount !== null ? String(staff.scopusCitationCount) : '',
    googleScholarUrl: staff.googleScholarUrl ?? '',
    googleScholarCitationCount:
      staff.googleScholarCitationCount !== null ? String(staff.googleScholarCitationCount) : '',
    orcidId: staff.orcidId ?? '',
    departmentId: staff.department?.id ?? '',
    divisionId: staff.division?.id ?? '',
    partTimeDepartmentIds: staff.partTimeDepartments.map((pd) => pd.department.id),
  };
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-foreground uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

interface StaffEditFormProps {
  staff: StaffDetail;
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  isAdmin: boolean;
  staffId: string;
}

export function StaffEditForm({
  staff,
  departments,
  divisions,
  isAdmin,
  staffId,
}: StaffEditFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<RawFormValues>({
    resolver: standardSchemaResolver(staffUpdateSchema as never),
    defaultValues: toFormValues(staff),
  });

  const isNppValue = watch('isNpp') === 'true';

  function onSubmit(data: StaffUpdateSchema) {
    startTransition(async () => {
      try {
        const result = await updateStaff(staffId, data);
        if (result?.error) toast.error(result.error);
      } catch {
        toast.error('Помилка сервера');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
      <SectionCard title="Основна інформація">
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
          {isAdmin && (
            <FormField label="Тип" error={errors.isNpp}>
              <Controller
                name="isNpp"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" disabled={isPending}>
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

      <SectionCard title="Місця роботи">
        <FieldGroup className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Основна кафедра" error={errors.departmentId}>
              <Controller
                name="departmentId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" disabled={isPending}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">—</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.faculty?.name ? `${dept.faculty.name} — ` : ''}
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Відділ" error={errors.divisionId}>
              <Controller
                name="divisionId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" disabled={isPending}>
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

          {isAdmin && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Сумісництво</p>
              <Controller
                name="partTimeDepartmentIds"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-1.5">
                    {departments.map((dept) => {
                      const checked = field.value.includes(dept.id);
                      return (
                        <label
                          key={dept.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                field.onChange(field.value.filter((id) => id !== dept.id));
                              } else {
                                field.onChange([...field.value, dept.id]);
                              }
                            }}
                          />
                          <span className="leading-tight">
                            {dept.faculty?.name && (
                              <span className="text-xs text-muted-foreground">
                                {dept.faculty.name} —{' '}
                              </span>
                            )}
                            {dept.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
            </div>
          )}
        </FieldGroup>
      </SectionCard>

      {isAdmin && (
        <SectionCard title="Конфіденційно">
          <FormField htmlFor="employmentRate" label="Ставка" error={errors.employmentRate}>
            <Input
              id="employmentRate"
              type="number"
              step="0.25"
              min="0"
              max="2"
              placeholder="1"
              disabled={isPending}
              {...register('employmentRate')}
            />
          </FormField>
        </SectionCard>
      )}

      {isNppValue && (
        <SectionCard title="Академічна інформація">
          <FieldGroup className="grid grid-cols-2 gap-4">
            <FormField label="Вчене звання" error={errors.academicRank}>
              <Controller
                name="academicRank"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" disabled={isPending}>
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
            <FormField label="Науковий ступінь" error={errors.scientificDegree}>
              <Controller
                name="scientificDegree"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" disabled={isPending}>
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
              error={errors.pedagogicalExperience}
            >
              <Input
                id="pedagogicalExperience"
                type="number"
                min="0"
                placeholder="0"
                disabled={isPending}
                {...register('pedagogicalExperience')}
              />
            </FormField>
            <FormField label="Ступінь відповідає кафедрі" error={errors.degreeMatchesDepartment}>
              <Controller
                name="degreeMatchesDepartment"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" disabled={isPending}>
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
          </FieldGroup>
        </SectionCard>
      )}

      {isNppValue && (
        <SectionCard title="Наукові профілі">
          <FieldGroup className="grid grid-cols-2 gap-4">
            <FormField htmlFor="wosUrl" label="Web of Science — URL" error={errors.wosUrl}>
              <Input
                id="wosUrl"
                placeholder="https://"
                disabled={isPending}
                {...register('wosUrl')}
              />
            </FormField>
            <FormField
              htmlFor="wosCitationCount"
              label="Web of Science — цитувань"
              error={errors.wosCitationCount}
            >
              <Input
                id="wosCitationCount"
                type="number"
                min="0"
                placeholder="0"
                disabled={isPending}
                {...register('wosCitationCount')}
              />
            </FormField>
            <FormField htmlFor="scopusUrl" label="Scopus — URL" error={errors.scopusUrl}>
              <Input
                id="scopusUrl"
                placeholder="https://"
                disabled={isPending}
                {...register('scopusUrl')}
              />
            </FormField>
            <FormField
              htmlFor="scopusCitationCount"
              label="Scopus — цитувань"
              error={errors.scopusCitationCount}
            >
              <Input
                id="scopusCitationCount"
                type="number"
                min="0"
                placeholder="0"
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
                placeholder="https://"
                disabled={isPending}
                {...register('googleScholarUrl')}
              />
            </FormField>
            <FormField
              htmlFor="googleScholarCitationCount"
              label="Google Scholar — цитувань"
              error={errors.googleScholarCitationCount}
            >
              <Input
                id="googleScholarCitationCount"
                type="number"
                min="0"
                placeholder="0"
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
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : 'Зберегти'}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href={`/staff/${staffId}`}>Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
