'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
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
import { staffCreateSchema, type StaffCreateSchema } from '@/validations/staff';
import { createStaff } from '@/app/(dashboard)/staff/actions';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import { ADMIN_POSITION_LABELS } from '@/lib/labels';
import { RatingFieldHint } from '@/components/staff/rating-field-hint';

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

const EMPTY_VALUES: RawFormValues = {
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

function SectionCard({
  title,
  step,
  children,
}: {
  title: string;
  step: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
        <span className="font-mono text-xs font-bold text-muted-foreground/30 tabular-nums select-none">
          {step}
        </span>
      </div>
      {children}
    </div>
  );
}

interface StaffCreateFormProps {
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  isAdmin: boolean;
}

export function StaffCreateForm({ departments, divisions, isAdmin }: StaffCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<RawFormValues>({
    resolver: standardSchemaResolver(staffCreateSchema as never),
    defaultValues: EMPTY_VALUES,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const isNppValue = watch('isNpp') === 'true';

  function onSubmit(data: StaffCreateSchema) {
    startTransition(async () => {
      try {
        const result = await createStaff(data);
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        toast.success('Збережено');
        router.push(result.redirectTo);
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast.error('Помилка сервера');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
      <SectionCard title="Основна інформація" step="01">
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
        </FieldGroup>
      </SectionCard>

      <SectionCard title="Місця роботи" step="02">
        <FieldGroup className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Основна кафедра" error={errors.departmentId}>
              <Controller
                name="departmentId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger className="w-full">
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
        <SectionCard title="Конфіденційно" step="03">
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
        <SectionCard title="Академічна інформація" step={isAdmin ? '04' : '03'}>
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
                placeholder="0"
                disabled={isPending}
                {...register('pedagogicalExperience')}
              />
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

      {isNppValue && (
        <SectionCard title="Наукові профілі" step={isAdmin ? '05' : '04'}>
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
              labelSuffix={<RatingFieldHint field="wosCitationCount" />}
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
              labelSuffix={<RatingFieldHint field="scopusCitationCount" />}
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
              labelSuffix={<RatingFieldHint field="googleScholarCitationCount" />}
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
          {isPending ? 'Збереження...' : 'Створити'}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/staff">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
