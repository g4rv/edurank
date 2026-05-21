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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { departmentSchema, type DepartmentSchema } from '@/validations/department';
import type { DepartmentActionState } from '@/app/(dashboard)/departments/actions';

type FacultyOption = { id: string; name: string };
type StaffOption = { id: string; lastName: string; firstName: string; patronymic: string };

function staffName(s: StaffOption) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

interface DepartmentFormProps {
  defaultValues?: Partial<DepartmentSchema>;
  faculties: FacultyOption[];
  staff: StaffOption[];
  action: (data: DepartmentSchema) => Promise<DepartmentActionState>;
  submitLabel: string;
}

export function DepartmentForm({
  defaultValues,
  faculties,
  staff,
  action,
  submitLabel,
}: DepartmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DepartmentSchema>({
    resolver: standardSchemaResolver(departmentSchema as never),
    defaultValues: { name: '', facultyId: '', headId: null, ...defaultValues },
  });

  function onSubmit(data: DepartmentSchema) {
    startTransition(async () => {
      try {
        const result = await action(data);
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <FormField htmlFor="name" label="Назва" error={errors.name}>
          <Input id="name" disabled={isPending} {...register('name')} />
        </FormField>

        <FormField label="Факультет" error={errors.facultyId}>
          <Controller
            name="facultyId"
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={isPending}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Оберіть факультет" />
                </SelectTrigger>
                <SelectContent>
                  {faculties.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField label="Завідувач кафедри" error={errors.headId}>
          <Controller
            name="headId"
            control={control}
            render={({ field }) => {
              const selected = staff.find((s) => s.id === field.value);
              return (
                <Combobox
                  items={staff}
                  value={field.value ?? ''}
                  onChange={(v) => field.onChange(v || null)}
                  filter={(s, q) => staffName(s).toLowerCase().includes(q.toLowerCase())}
                  displayValue={selected ? staffName(selected) : ''}
                  disabled={isPending}
                >
                  <ComboboxInput placeholder="—" />
                  <ComboboxContent>
                    <ComboboxEmpty>Нікого не знайдено</ComboboxEmpty>
                    <ComboboxList<StaffOption>>
                      {(s) => (
                        <ComboboxItem key={s.id} value={s.id}>
                          {staffName(s)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              );
            }}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : submitLabel}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/departments">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
