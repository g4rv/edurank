'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { KeyRound, LockOpen, LogOut, MailPlus, RotateCcw } from 'lucide-react';
import {
  sendInvite,
  resetPassword,
  setPasswordManually,
  forceLogout,
  changeRole,
  unlockLogin,
  type AccountActionState,
} from '@/app/(dashboard)/staff/[id]/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PassInput } from '@/components/ui/pass-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROLE_LABELS } from '@/lib/labels';
import { setPasswordSchema, type SetPasswordSchema } from '@/validations/account';
import type { Role } from '@/lib/generated/prisma/client';
import type { StaffAccount } from '@/lib/queries/get-staff-account';
import { cn } from '@/lib/utils';

interface AccountCardProps {
  staffId: string;
  account: StaffAccount;
  isSelf: boolean;
}

export function AccountCard({ staffId, account, isSelf }: AccountCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<AccountActionState>) {
    startTransition(async () => {
      const result = await action();
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Обліковий запис
        </h2>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            account.isActivated
              ? 'bg-green-500/10 text-green-600'
              : 'bg-amber-500/10 text-amber-600'
          )}
        >
          {account.isActivated ? 'Активовано' : 'Не активовано'}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <span className="text-xs text-muted-foreground">Роль</span>
          <div className="mt-1">
            <Select
              value={account.role}
              disabled={isPending || isSelf}
              onValueChange={(value) => run(() => changeRole(staffId, { role: value as Role }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isSelf && (
            <p className="mt-1 text-xs text-muted-foreground">Власну роль змінити не можна</p>
          )}
        </div>

        {!account.isActivated && account.invite && (
          <p className="text-xs text-muted-foreground">
            Запрошення надіслано {account.invite.sentAt.toLocaleDateString('uk-UA')}
            {account.invite.expired && ' — посилання протерміноване'}
          </p>
        )}

        {/* Only while it is actually locked. A permanent «не заблоковано» line
            would be noise on 300 pages to serve the rare one. */}
        {account.lockedUntil && (
          <p className="rounded-lg border border-amber-600/40 bg-amber-600/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
            Вхід заблоковано після невдалих спроб — до{' '}
            {account.lockedUntil.toLocaleTimeString('uk-UA', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            . Людина може зачекати або ви знімаєте блокування зараз.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {account.lockedUntil && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => unlockLogin(staffId))}
            >
              <LockOpen className="size-4" />
              Зняти блокування входу
            </Button>
          )}

          {!account.isActivated && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => sendInvite(staffId))}
            >
              <MailPlus className="size-4" />
              {account.invite ? 'Надіслати запрошення повторно' : 'Надіслати запрошення'}
            </Button>
          )}

          {account.isActivated && (
            <ConfirmButton
              icon={<RotateCcw className="size-4" />}
              label="Скинути пароль"
              title="Скинути пароль?"
              description="Пароль буде видалено, всі сесії завершено, а на email прийде лист із посиланням для встановлення нового пароля."
              confirmLabel="Скинути"
              disabled={isPending}
              onConfirm={() => run(() => resetPassword(staffId))}
            />
          )}

          <ManualPasswordDialog
            disabled={isPending}
            onSubmit={(data) => run(() => setPasswordManually(staffId, data))}
          />

          {account.isActivated && !isSelf && (
            <ConfirmButton
              icon={<LogOut className="size-4" />}
              label="Завершити всі сесії"
              title="Завершити всі сесії?"
              description="Людину буде розлогінено на всіх пристроях при наступному запиті."
              confirmLabel="Завершити"
              disabled={isPending}
              onConfirm={() => run(() => forceLogout(staffId))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmButton({
  icon,
  label,
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {icon}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ManualPasswordDialog({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (data: SetPasswordSchema) => void;
}) {
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SetPasswordSchema>({
    resolver: standardSchemaResolver(setPasswordSchema),
  });

  function submit(data: SetPasswordSchema) {
    onSubmit(data);
    setOpen(false);
    reset();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <KeyRound className="size-4" />
          Встановити пароль вручну
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Встановити пароль вручну</AlertDialogTitle>
          <AlertDialogDescription>
            Резервний варіант, якщо лист не доходить. Передайте пароль людині особисто.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <FormField htmlFor="manual-password" label="Новий пароль" error={errors.password}>
            <PassInput id="manual-password" autoComplete="new-password" {...register('password')} />
          </FormField>
          <FormField
            htmlFor="manual-confirm"
            label="Повторіть пароль"
            error={errors.confirmPassword}
          >
            <PassInput
              id="manual-confirm"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
          </FormField>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
            <Button type="submit">Встановити</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
