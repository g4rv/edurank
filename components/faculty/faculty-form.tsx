'use client';

import { useState, useTransition } from 'react';
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
import { facultySchema, type FacultySchema } from '@/validations/faculty';
import type { FacultyActionState } from '@/app/(dashboard)/faculties/actions';

type StaffOption = { id: string; lastName: string; firstName: string; patronymic: string };

interface FacultyFormProps {
  defaultValues?: Partial<FacultySchema>;
  staff: StaffOption[];
  action: (data: FacultySchema) => Promise<FacultyActionState>;
  submitLabel: string;
}

export function FacultyForm({ defaultValues, staff, action, submitLabel }: FacultyFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
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
    setServerError(null);
    startTransition(async () => {
      const result = await action(data);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <FormField htmlFor="name" label="Назва" error={errors.name}>
          <Input id="name" disabled={isPending} {...register('name')} />
        </FormField>

        <FormField label="Декан" error={errors.deanId}>
          <Controller
            name="deanId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? ''}
                onValueChange={(v) => field.onChange(v === '__none' ? null : v)}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.lastName} {s.firstName} {s.patronymic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
