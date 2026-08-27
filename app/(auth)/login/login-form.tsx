'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Button } from '@/components/ui/button';
import { FieldError, FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PassInput } from '@/components/ui/pass-input';
import { loginSchema, type LoginSchema } from '@/validations/login';
import { loginAction } from './actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  // Where the proxy was sending them before it found no session cookie. Passed
  // straight through — `safeCallbackPath` on the server decides whether it is
  // a same-site path worth honouring.
  const callbackUrl = useSearchParams().get('callbackUrl');

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<LoginSchema>({
    resolver: standardSchemaResolver(loginSchema),
  });

  function onSubmit(data: LoginSchema) {
    // «Невірний email або пароль» is the result of this form, not an unrelated
    // background event, so it belongs in the form. A toast puts it in the corner
    // of a page that is nothing but this form, and then takes it away again.
    // It goes on the form rather than on a field on purpose: which of the two is
    // wrong is deliberately not disclosed.
    clearErrors('root');
    startTransition(async () => {
      const result = await loginAction(data, callbackUrl);
      if (result?.error) setError('root', { message: result.error });
    });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">EduRank</h1>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FieldGroup className="flex flex-col gap-4">
            <FormField htmlFor="email" label="Email" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="email@example.com"
                disabled={isPending}
                {...register('email')}
              />
            </FormField>

            <FormField htmlFor="password" label="Пароль" error={errors.password}>
              <PassInput
                id="password"
                autoComplete="current-password"
                disabled={isPending}
                {...register('password')}
              />
            </FormField>
          </FieldGroup>

          {errors.root?.message && <FieldError errors={[{ message: errors.root.message }]} />}

          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? 'Вхід...' : 'Увійти'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Забули пароль?
          </Link>
        </div>
      </div>
    </div>
  );
}
