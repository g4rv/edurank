'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { staffUpdateSchema, type StaffUpdateSchema } from '@/validations/staff';
import { updateStaff } from '@/app/(dashboard)/staff/[id]/actions';
import type { StaffDetail } from '@/lib/queries/get-staff';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import {
  StaffFormFields,
  staffToFormValues,
  type RawStaffFormValues,
} from '@/components/staff/staff-form-fields';

interface StaffEditFormProps {
  staff: StaffDetail;
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  isAdmin: boolean;
  staffId: string;
}

export function StaffEditForm({
  staff,
  departments,
  divisions,
  isAdmin,
  staffId,
}: StaffEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<RawStaffFormValues>({
    resolver: standardSchemaResolver(staffUpdateSchema as never),
    defaultValues: staffToFormValues(staff),
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const isNppValue = watch('isNpp') === 'true';

  function onSubmit(data: StaffUpdateSchema) {
    startTransition(async () => {
      try {
        const result = await updateStaff(staffId, data);
        if ('error' in result) {
          toast.error(result.error);
        } else {
          toast.success('Збережено');
          router.refresh();
        }
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast.error('Сталася помилка');
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
        // Switching someone between НПП and administrative changes which rating
        // rows they get, so only ADMIN may do it after the record exists
        canEditType={isAdmin}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : 'Зберегти'}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href={`/staff/${staffId}`}>Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
