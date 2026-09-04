'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { AuroraButton } from '@/components/aurora/button';
import { EmailInput } from '@/components/aurora/email-input';
import { forgotPasswordSchema, type ForgotPasswordSchema } from '@/validations/account';
import { RequiredFields } from '@/components/ui/required-fields';
import { Logo } from '@/components/aurora/logo';
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
        <h1>
          <Logo size="lg" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Відновлення пароля</p>
      </div>

      <div className="glass rounded-2xl p-6">
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
          <RequiredFields schema={forgotPasswordSchema}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Вкажіть email вашого облікового запису — ми надішлемо посилання для встановлення
                нового пароля.
              </p>
              <FieldGroup className="flex flex-col gap-4">
                <FormField htmlFor="email" label="Email" error={errors.email}>
                  <EmailInput id="email" size="lg" disabled={isPending} {...register('email')} />
                </FormField>
              </FieldGroup>
              <AuroraButton type="submit" size="xl" loading={isPending} className="w-full">
                {isPending ? 'Надсилання...' : 'Надіслати посилання'}
              </AuroraButton>
            </form>
          </RequiredFields>
        )}

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm text-foreground/70 underline-offset-4 transition-colors hover:text-brand hover:underline"
          >
            Повернутися до входу
          </Link>
        </div>
      </div>
    </div>
  );
}
