'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PassInput } from '@/components/ui/pass-input';
import { loginSchema, type LoginSchema } from '@/validations/login';
import { loginAction } from './actions';

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchema>({
    resolver: standardSchemaResolver(loginSchema),
  });

  function onSubmit(data: LoginSchema) {
    startTransition(async () => {
      const result = await loginAction(data);
      if (result?.error) toast.error(result.error);
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
                placeholder="admin@edurank.local"
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
