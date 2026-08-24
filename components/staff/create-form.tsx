'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { staffCreateSchema, type StaffCreateSchema } from '@/validations/staff';
import { createStaff } from '@/app/(dashboard)/staff/actions';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import {
  StaffFormFields,
  EMPTY_STAFF_FORM_VALUES,
  type RawStaffFormValues,
} from '@/components/staff/staff-form-fields';

interface StaffCreateFormProps {
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  isAdmin: boolean;
}

export function StaffCreateForm({ departments, divisions, isAdmin }: StaffCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<RawStaffFormValues>({
    resolver: standardSchemaResolver(staffCreateSchema as never),
    defaultValues: EMPTY_STAFF_FORM_VALUES,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const isNppValue = watch('isNpp') === 'true';

  // Not part of the Zod schema: staffCreateSchema ends in .superRefine(), so it
  // cannot be .extend()ed, and this is not a property of the person anyway —
  // it is what to do once they exist.
  const [sendInvite, setSendInvite] = useState(false);

  function onSubmit(data: StaffCreateSchema) {
    startTransition(async () => {
      try {
        const result = await createStaff(data, { sendInvite });
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        // The record exists either way — only the mail can have failed, and
        // that is the one thing the person creating it needs to know about.
        if (result.inviteWarning) toast.warning(result.inviteWarning);
        else toast.success(sendInvite ? 'Збережено. Запрошення надіслано' : 'Збережено');
        router.push(result.redirectTo);
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast.error('Помилка сервера');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
      <StaffFormFields
        register={register}
        control={control}
        errors={errors}
        setValue={setValue}
        isPending={isPending}
        isAdmin={isAdmin}
        isNpp={isNppValue}
        departments={departments}
        divisions={divisions}
        // Numbered sections read as steps while filling a blank record
        numbered
        // The type has to be chosen up front, whoever is creating the record
        canEditType
      />

      {/* ADMIN only: handing out an account has never been an editor's to do,
          so the switch is not shown to them and the server ignores the flag. */}
      {isAdmin && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card p-3 text-sm">
          <Switch checked={sendInvite} onCheckedChange={setSendInvite} disabled={isPending} />
          <span>
            Надіслати запрошення одразу
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Людина отримає лист із посиланням, щоб установити пароль. Інакше запрошення можна
              надіслати пізніше з її сторінки.
            </span>
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : 'Створити'}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/staff">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
