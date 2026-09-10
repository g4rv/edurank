'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
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
} from '@/components/aurora/ui/alert-dialog';
import { Button } from '@/components/aurora/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PassInput } from '@/components/aurora/ui/pass-input';
import { PasswordRules } from '@/components/ui/password-rules';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { ROLE_LABELS } from '@/lib/labels';
import { setPasswordSchema, type SetPasswordSchema } from '@/validations/account';
import type { Role } from '@/lib/generated/prisma/client';
import type { StaffAccount } from '@/lib/queries/get-staff-account';
import { cn } from '@/lib/utils';
import { RequiredFields } from '@/components/ui/required-fields';

interface AccountCardProps {
  staffId: string;
  account: StaffAccount;
  isSelf: boolean;
}

/**
 * Can this person sign in — one badge.
 *
 * Exported because it belongs to the IDENTITY BAND rather than to this card
 * (owner, 2026-09-07). «Архівований» is already up there and says almost the
 * same thing, so the two sitting apart was the odd part: whether somebody can
 * get in is a fact about who they are, like НПП or Сумісник, and not a detail
 * of a panel two thirds down the right column.
 *
 * Green and amber — the project's own «ok» and «needs attention», the second
 * being the same amber as «Сумісник».
 */
export function AccountBadge({ account }: { account: StaffAccount }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        account.isActivated
          ? 'bg-green-500/10 text-green-600 dark:text-green-500'
          : 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
      )}
    >
      {account.isActivated ? 'Активовано' : 'Не активовано'}
    </span>
  );
}

/**
 * Everything an ADMIN can DO to an account: the role, and the four things that
 * get somebody back in.
 *
 * Two shapes, because it is rendered in two places:
 *
 * - `card` — stacked, full-width buttons. What it has always been, and what
 *   `/staff/[id]` still renders.
 * - `bar` — one row of `h-8` controls, sized to sit beside the tab bar. The
 *   card was far wider than its own contents needed (owner, 2026-09-07): a
 *   column of five full-width buttons carrying two words each, taking half the
 *   page to say what a row says.
 *
 * The notes travel with it either way. An invitation date and a lockout are the
 * context for the buttons beside them, so they must not be left behind in a
 * card the buttons have moved out of.
 */
export function AccountControls({
  staffId,
  account,
  isSelf,
  variant = 'card',
}: AccountCardProps & { variant?: 'card' | 'bar' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const bar = variant === 'bar';

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
    <div className={cn('flex', bar ? 'flex-wrap items-center gap-x-3 gap-y-2' : 'flex-col gap-4')}>
      <div className={cn('flex', bar ? 'items-center gap-2 pl-2' : 'flex-col')}>
        <span className={cn('text-muted-foreground', bar ? 'text-sm' : 'text-xs')}>Роль</span>
        <div className={bar ? '' : 'mt-1'}>
          <Select
            value={account.role}
            disabled={isPending || isSelf}
            onValueChange={(value) => run(() => changeRole(staffId, { role: value as Role }))}
          >
            <SelectTrigger className={bar ? 'w-40' : 'w-full'}>
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
      </div>

      <div className={cn('flex gap-2', bar ? 'flex-wrap items-center' : 'flex-col')}>
        {account.lockedUntil && (
          <Button
            variant={bar ? 'ghost' : 'outline'}
            size={bar ? 'default' : 'sm'}
            disabled={isPending}
            onClick={() => run(() => unlockLogin(staffId))}
          >
            <LockOpen />
            Зняти блокування входу
          </Button>
        )}

        {!account.isActivated && (
          <Button
            variant={bar ? 'ghost' : 'outline'}
            size={bar ? 'default' : 'sm'}
            disabled={isPending}
            onClick={() => run(() => sendInvite(staffId))}
          >
            <MailPlus />
            {account.invite ? 'Надіслати повторно' : 'Надіслати запрошення'}
          </Button>
        )}

        {account.isActivated && (
          <ConfirmButton
            icon={<RotateCcw />}
            label="Скинути пароль"
            title="Скинути пароль?"
            description="Пароль буде видалено, всі сесії завершено, а на email прийде лист із посиланням для встановлення нового пароля."
            confirmLabel="Скинути"
            size={bar ? 'default' : 'sm'}
            variant={bar ? 'ghost' : 'outline'}
            disabled={isPending}
            onConfirm={() => run(() => resetPassword(staffId))}
          />
        )}

        <ManualPasswordDialog
          size={bar ? 'default' : 'sm'}
          variant={bar ? 'ghost' : 'outline'}
          disabled={isPending}
          onSubmit={(data) => run(() => setPasswordManually(staffId, data))}
        />

        {account.isActivated && !isSelf && (
          <ConfirmButton
            icon={<LogOut />}
            label="Завершити всі сесії"
            title="Завершити всі сесії?"
            description="Людину буде розлогінено на всіх пристроях при наступному запиті."
            confirmLabel="Завершити"
            size={bar ? 'default' : 'sm'}
            variant={bar ? 'ghost' : 'outline'}
            disabled={isPending}
            onConfirm={() => run(() => forceLogout(staffId))}
          />
        )}
      </div>

      {/* On the bar these take the whole width, so a lockout warning never has
          to compete with a select for a line. */}
      {(isSelf || (!account.isActivated && account.invite) || account.lockedUntil) && (
        <div className={cn('flex flex-col gap-1', bar && 'basis-full px-2 pb-1')}>
          {isSelf && <p className="text-xs text-muted-foreground">Власну роль змінити не можна</p>}

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
        </div>
      )}
    </div>
  );
}

/**
 * The card form — still what `/staff/[id]` renders, until that page moves over
 * to the band.
 */
export function AccountCard(props: AccountCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Обліковий запис
        </h2>
        <AccountBadge account={props.account} />
      </div>
      <AccountControls {...props} />
    </div>
  );
}

function ConfirmButton({
  icon,
  label,
  title,
  description,
  confirmLabel,
  size = 'sm',
  variant = 'outline',
  disabled,
  onConfirm,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  size?: 'sm' | 'default';
  /**
   * `ghost` inside a `ToolbarGroup`, `outline` on the card.
   *
   * A strip is the object and its contents are not (owner, 2026-09-09): an
   * outlined button inside an outlined bar draws a border inside a border, and
   * a row of four of them reads as four objects rather than one toolbar. On the
   * card there is no strip, so the button has to draw its own edge.
   */
  variant?: 'outline' | 'ghost';
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
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
  size = 'sm',
  variant = 'outline',
  disabled,
  onSubmit,
}: {
  size?: 'sm' | 'default';
  /** `ghost` in a `ToolbarGroup` — see the note on `ConfirmButton`. */
  variant?: 'outline' | 'ghost';
  disabled: boolean;
  onSubmit: (data: SetPasswordSchema) => void;
}) {
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<SetPasswordSchema>({
    resolver: standardSchemaResolver(setPasswordSchema),
  });
  // `useWatch` rather than `watch()`: the latter returns a fresh function the
  // React Compiler cannot memoize, and it warns about it.
  const password = useWatch({ control, name: 'password' }) ?? '';

  function submit(data: SetPasswordSchema) {
    onSubmit(data);
    setOpen(false);
    reset();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          <KeyRound />
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
        <RequiredFields schema={setPasswordSchema}>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <FormField htmlFor="manual-password" label="Новий пароль" error={errors.password}>
              <PassInput
                id="manual-password"
                autoComplete="new-password"
                {...register('password')}
              />
              <PasswordRules value={password} className="mt-2" />
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
        </RequiredFields>
      </AlertDialogContent>
    </AlertDialog>
  );
}
