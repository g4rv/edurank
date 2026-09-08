'use client';

import { useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/aurora/ui/button';
import { PassInput } from '@/components/aurora/ui/pass-input';
import { PasswordRules } from '@/components/ui/password-rules';
import { setPasswordSchema, type SetPasswordSchema } from '@/validations/account';
import { RequiredFields } from '@/components/ui/required-fields';
import { Logo } from '@/components/aurora/logo';
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
    control,
    formState: { errors },
  } = useForm<SetPasswordSchema>({
    resolver: standardSchemaResolver(setPasswordSchema),
  });
  // `useWatch` rather than `watch()`: the latter returns a fresh function the
  // React Compiler cannot memoize, and it warns about it.
  const password = useWatch({ control, name: 'password' }) ?? '';

  function onSubmit(data: SetPasswordSchema) {
    startTransition(async () => {
      const result = await activateAction(token, data);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1>
          <Logo size="lg" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Встановіть пароль для входу</p>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="mb-4">
          <p className="text-sm font-medium">{fullName}</p>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>

        <RequiredFields schema={setPasswordSchema}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FieldGroup className="flex flex-col gap-4">
              <FormField htmlFor="password" label="Новий пароль" error={errors.password}>
                <PassInput
                  id="password"
                  size="lg"
                  autoComplete="new-password"
                  disabled={isPending}
                  {...register('password')}
                />
                {/* Under the field and visible from the start: this is the one
                  screen where somebody meets our rules for the first time. */}
                <PasswordRules value={password} className="mt-2" />
              </FormField>

              <FormField
                htmlFor="confirmPassword"
                label="Повторіть пароль"
                error={errors.confirmPassword}
              >
                <PassInput
                  id="confirmPassword"
                  size="lg"
                  autoComplete="new-password"
                  disabled={isPending}
                  {...register('confirmPassword')}
                />
              </FormField>
            </FieldGroup>

            <Button type="submit" size="xl" loading={isPending} className="w-full">
              {isPending ? 'Збереження...' : 'Встановити пароль і увійти'}
            </Button>
          </form>
        </RequiredFields>
      </div>
    </div>
  );
}
