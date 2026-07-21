'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<RawStaffFormValues>({
    resolver: standardSchemaResolver(staffCreateSchema as never),
    defaultValues: EMPTY_STAFF_FORM_VALUES,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const isNppValue = watch('isNpp') === 'true';

  function onSubmit(data: StaffCreateSchema) {
    startTransition(async () => {
      try {
        const result = await createStaff(data);
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
    <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
      <StaffFormFields
        register={register}
        control={control}
        errors={errors}
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
