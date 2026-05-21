'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { useForm, Controller } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PassInput } from '@/components/ui/pass-input';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { userFormSchema, type UserFormSchema } from '@/validations/user';
import type { UserActionState } from '@/app/(dashboard)/admin/users/actions';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Адміністратор' },
  { value: 'EDITOR', label: 'Редактор' },
  { value: 'USER', label: 'Користувач' },
] as const;

type StaffOption = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  email: string;
};

function staffLabel(s: StaffOption) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

interface UserFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<UserFormSchema>;
  action: (data: UserFormSchema) => Promise<UserActionState>;
  availableStaff: StaffOption[];
}

export function UserForm({ mode, defaultValues, action, availableStaff }: UserFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormSchema>({
    resolver: standardSchemaResolver(userFormSchema as never),
    defaultValues: {
      email: '',
      password: null,
      confirmPassword: null,
      role: 'USER',
      staffId: null,
      ...defaultValues,
    },
  });

  function onSubmit(data: UserFormSchema) {
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
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <FormField htmlFor="email" label="Email" error={errors.email}>
          <Input id="email" type="email" disabled={isPending} {...register('email')} />
        </FormField>

        <FormField
          htmlFor="password"
          label={mode === 'create' ? 'Пароль' : 'Новий пароль'}
          description={mode === 'edit' ? 'Залиште порожнім, щоб не змінювати' : undefined}
          error={errors.password as { message?: string } | undefined}
        >
          <PassInput id="password" disabled={isPending} {...register('password')} />
        </FormField>

        <FormField
          htmlFor="confirmPassword"
          label="Підтвердження пароля"
          error={errors.confirmPassword as { message?: string } | undefined}
        >
          <PassInput id="confirmPassword" disabled={isPending} {...register('confirmPassword')} />
        </FormField>

        <FormField label="Роль" error={errors.role}>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField label="Прив'язаний співробітник" error={errors.staffId}>
          <Controller
            name="staffId"
            control={control}
            render={({ field }) => {
              const selected = availableStaff.find((s) => s.id === field.value);
              return (
                <Combobox
                  items={availableStaff}
                  value={field.value ?? ''}
                  onChange={(v) => field.onChange(v || null)}
                  filter={(s, q) =>
                    `${staffLabel(s)} ${s.email}`.toLowerCase().includes(q.toLowerCase())
                  }
                  displayValue={selected ? staffLabel(selected) : ''}
                  disabled={isPending}
                >
                  <ComboboxInput placeholder="—" />
                  <ComboboxContent>
                    <ComboboxEmpty>Нікого не знайдено</ComboboxEmpty>
                    <ComboboxList<StaffOption>>
                      {(s) => (
                        <ComboboxItem key={s.id} value={s.id}>
                          <span>
                            {staffLabel(s)}{' '}
                            <span className="text-muted-foreground">({s.email})</span>
                          </span>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              );
            }}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : mode === 'create' ? 'Створити' : 'Зберегти'}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/admin/users">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
