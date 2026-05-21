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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { facultySchema, type FacultySchema } from '@/validations/faculty';
import type { FacultyActionState } from '@/app/(dashboard)/faculties/actions';

type StaffOption = { id: string; lastName: string; firstName: string; patronymic: string };

function staffName(s: StaffOption) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

interface FacultyFormProps {
  defaultValues?: Partial<FacultySchema>;
  staff: StaffOption[];
  action: (data: FacultySchema) => Promise<FacultyActionState>;
  submitLabel: string;
}

export function FacultyForm({ defaultValues, staff, action, submitLabel }: FacultyFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FacultySchema>({
    resolver: standardSchemaResolver(facultySchema as never),
    defaultValues: { name: '', deanId: null, ...defaultValues },
  });

  function onSubmit(data: FacultySchema) {
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

        <FormField label="Декан" error={errors.deanId}>
          <Controller
            name="deanId"
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
          <Link href="/faculties">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
