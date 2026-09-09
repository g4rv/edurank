'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { fullName } from '@/components/staff/profile/primitives';
import { staffUpdateSchema, type StaffUpdateSchema } from '@/validations/staff';
import { updateStaff } from '@/app/(dashboard)/staff/[id]/actions';
import type { StaffDetail } from '@/lib/queries/get-staff';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import type { StakePart } from '@/lib/queries/get-stake-breakdown';
import { RequiredFields } from '@/components/ui/required-fields';
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
  /** ADMIN, or a division granted `partTimeDepartmentIds` */
  canEditPartTime: boolean;
  /**
   * Which Staff columns this editor's division may actually write, or
   * `undefined` for ADMIN. Ungranted fields are shown and disabled — the save
   * drops them, so offering them collected a change and threw it away
   * (2026-08-27).
   */
  editableFields?: readonly string[];
  staffId: string;
  /** What each кафедра allocated this person — shown under its own select */
  stakeBreakdown: StakePart[];
}

export function StaffEditForm({
  staff,
  departments,
  divisions,
  isAdmin,
  canEditPartTime,
  editableFields,
  staffId,
  stakeBreakdown,
}: StaffEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isDirty },
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
    <RequiredFields schema={staffUpdateSchema}>
      <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
        {/* The actions live in a HEADER, not a bar at the foot (owner,
            2026-09-07). It is the profile's `IdentityBand` in shape — same card,
            same avatar, same actions pinned top right — so leaving the record to
            edit it does not feel like arriving somewhere else.

            «Зберегти» is disabled while nothing has been typed: the button says
            so itself instead of accepting a click, running the action and
            answering «Збережено» for a write that changed no column.

            «Скасувати» is NEVER disabled. It is the way out of this screen, and
            «no changes yet» is exactly when somebody is most likely to be
            leaving. */}
        <Card className="flex flex-wrap items-center gap-5">
          <Avatar name={fullName(staff)} size="lg" />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">{fullName(staff)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Редагування профілю</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
            <span className="text-sm text-muted-foreground">
              {isPending ? 'Збереження…' : isDirty ? 'Є незбережені зміни' : 'Без змін'}
            </span>
            <Button type="submit" disabled={isPending || !isDirty}>
              Зберегти
            </Button>
            <Button asChild variant="outline">
              <Link href={`/staff/${staffId}`}>Скасувати</Link>
            </Button>
          </div>
        </Card>

        <StaffFormFields
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          stakeBreakdown={stakeBreakdown}
          isPending={isPending}
          isAdmin={isAdmin}
          canEditPartTime={canEditPartTime}
          editableFields={editableFields}
          isNpp={isNppValue}
          departments={departments}
          divisions={divisions}
          // Switching someone between НПП and administrative changes which rating
          // rows they get, so only ADMIN may do it after the record exists
          canEditType={isAdmin}
          // Two flowing columns, not a grid: a grid row is as tall as its
          // tallest cell, so «Основна інформація» either stretched to match
          // «Місця роботи» or left a gap under it.
          layout="columns"
        />
      </form>
    </RequiredFields>
  );
}
