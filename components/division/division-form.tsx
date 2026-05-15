'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { divisionSchema, type DivisionSchema } from '@/validations/division';
import type { DivisionActionState } from '@/app/(dashboard)/divisions/actions';

interface DivisionFormProps {
  defaultValues?: Partial<DivisionSchema>;
  action: (data: DivisionSchema) => Promise<DivisionActionState>;
  submitLabel: string;
}

export function DivisionForm({ defaultValues, action, submitLabel }: DivisionFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DivisionSchema>({
    resolver: standardSchemaResolver(divisionSchema as never),
    defaultValues: { name: '', ...defaultValues },
  });

  function onSubmit(data: DivisionSchema) {
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result?.error) toast.error(result.error);
      } catch {
        toast.error('Помилка сервера');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <FormField htmlFor="name" label="Назва" error={errors.name}>
          <Input id="name" disabled={isPending} {...register('name')} />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : submitLabel}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/divisions">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
