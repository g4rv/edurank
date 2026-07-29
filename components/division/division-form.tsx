'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { Controller, useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { divisionSchema, type DivisionSchema } from '@/validations/division';
import type { DivisionActionState } from '@/app/(dashboard)/divisions/actions';

interface DivisionFormProps {
  defaultValues?: Partial<DivisionSchema>;
  action: (data: DivisionSchema) => Promise<DivisionActionState>;
  submitLabel: string;
}

export function DivisionForm({ defaultValues, action, submitLabel }: DivisionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DivisionSchema>({
    resolver: standardSchemaResolver(divisionSchema as never),
    defaultValues: { name: '', canModerateRating: false, ...defaultValues },
  });

  function onSubmit(data: DivisionSchema) {
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
      <div className="space-y-5 rounded-xl border bg-card p-5">
        <FormField htmlFor="name" label="Назва" error={errors.name}>
          <Input id="name" disabled={isPending} {...register('name')} />
        </FormField>

        <label className="flex cursor-pointer items-start gap-3">
          <Controller
            name="canModerateRating"
            control={control}
            render={({ field }) => (
              <Switch
                checked={!!field.value}
                disabled={isPending}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <span className="text-sm">
            Модерація рейтингу
            <span className="block text-xs text-muted-foreground">
              Редактори цього відділу зможуть відхиляти подання НПП із зазначенням причини та
              позначати публікації як перевірені
            </span>
          </span>
        </label>
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
