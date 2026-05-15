'use client';

import { useTransition } from 'react';
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

interface UserFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<UserFormSchema>;
  action: (data: UserFormSchema) => Promise<UserActionState>;
  availableStaff: StaffOption[];
}

export function UserForm({ mode, defaultValues, action, availableStaff }: UserFormProps) {
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
        if (result?.error) toast.error(result.error);
      } catch {
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
            render={({ field }) => (
              <Select
                value={field.value ?? ''}
                onValueChange={(v) => field.onChange(v === '__none' ? null : v)}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {availableStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.lastName} {s.firstName} {s.patronymic}{' '}
                      <span className="text-muted-foreground">({s.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
