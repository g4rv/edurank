'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema, type ForgotPasswordSchema } from '@/validations/account';
import { requestPasswordReset } from './actions';

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordSchema>({
    resolver: standardSchemaResolver(forgotPasswordSchema),
  });

  function onSubmit(data: ForgotPasswordSchema) {
    startTransition(async () => {
      const result = await requestPasswordReset(data);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">EduRank</h1>
        <p className="mt-2 text-sm text-muted-foreground">Відновлення пароля</p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm">
              Якщо такий email зареєстровано в системі, на нього надіслано лист із посиланням для
              встановлення нового пароля.
            </p>
            <p className="text-sm text-muted-foreground">
              Перевірте пошту (і папку «Спам»). Діє останнє надіслане посилання.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Вкажіть email вашого облікового запису — ми надішлемо посилання для встановлення
              нового пароля.
            </p>
            <FieldGroup className="flex flex-col gap-4">
              <FormField htmlFor="email" label="Email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  disabled={isPending}
                  {...register('email')}
                />
              </FormField>
            </FieldGroup>
            <Button type="submit" size="lg" disabled={isPending} className="w-full">
              {isPending ? 'Надсилання...' : 'Надіслати посилання'}
            </Button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Повернутися до входу
          </Link>
        </div>
      </div>
    </div>
  );
}
