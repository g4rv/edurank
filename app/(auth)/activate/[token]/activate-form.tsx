'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { PassInput } from '@/components/ui/pass-input';
import { setPasswordSchema, type SetPasswordSchema } from '@/validations/account';
import { activateAction } from './actions';

export function ActivateForm({
  token,
  fullName,
  email,
}: {
  token: string;
  fullName: string;
  email: string;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordSchema>({
    resolver: standardSchemaResolver(setPasswordSchema),
  });

  function onSubmit(data: SetPasswordSchema) {
    startTransition(async () => {
      const result = await activateAction(token, data);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">EduRank</h1>
        <p className="mt-2 text-sm text-muted-foreground">Встановіть пароль для входу</p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-sm font-medium">{fullName}</p>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FieldGroup className="flex flex-col gap-4">
            <FormField htmlFor="password" label="Новий пароль" error={errors.password}>
              <PassInput
                id="password"
                autoComplete="new-password"
                disabled={isPending}
                {...register('password')}
              />
            </FormField>

            <FormField
              htmlFor="confirmPassword"
              label="Повторіть пароль"
              error={errors.confirmPassword}
            >
              <PassInput
                id="confirmPassword"
                autoComplete="new-password"
                disabled={isPending}
                {...register('confirmPassword')}
              />
            </FormField>
          </FieldGroup>

          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? 'Збереження...' : 'Встановити пароль і увійти'}
          </Button>
        </form>
      </div>
    </div>
  );
}
