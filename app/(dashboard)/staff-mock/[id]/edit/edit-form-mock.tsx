'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { staffUpdateSchema } from '@/validations/staff';
import type { StaffDetail } from '@/lib/queries/get-staff';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import type { StakePart } from '@/lib/queries/get-stake-breakdown';
import { RequiredFields } from '@/components/ui/required-fields';
import { FormActions } from '@/components/ui/form-actions';
import { AuroraButton } from '@/components/aurora/ui/button';
import {
  StaffFormFields,
  staffToFormValues,
  type RawStaffFormValues,
} from '@/components/staff/staff-form-fields';

/**
 * The edit form, mounted on invented data.
 *
 * It renders the REAL `StaffFormFields` — 700 lines of wired fields — rather
 * than a facsimile, so what is being judged is the shell around them: the
 * sticky actions, the card treatment, the section order. A copy of those
 * fields would drift from the originals within a day and prove nothing.
 *
 * Submitting saves nothing. There is no record behind this to save to.
 */
export function EditFormMock({
  staff,
  departments,
  divisions,
  stakeBreakdown,
}: {
  staff: StaffDetail;
  // The real option types, so the mock data is checked against what the query
  // actually returns rather than against a hand-written shape that can drift.
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  stakeBreakdown: StakePart[];
}) {
  const [saved, setSaved] = useState(false);

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

  return (
    <RequiredFields schema={staffUpdateSchema}>
      <form
        onSubmit={handleSubmit(() => {
          setSaved(true);
          toast.success('Чернетка — нічого не збережено');
        })}
        className="space-y-4"
      >
        <StaffFormFields
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          stakeBreakdown={stakeBreakdown}
          isPending={false}
          isAdmin
          canEditPartTime
          isNpp={isNppValue}
          departments={departments}
          divisions={divisions}
          canEditType
        />

        <FormActions>
          <AuroraButton type="submit">Зберегти</AuroraButton>
          <AuroraButton asChild variant="outline">
            <Link href={`/staff-mock/${staff.id}`}>Скасувати</Link>
          </AuroraButton>

          {/* Says whether there is anything TO save. The old form gave no
              standing sign, so somebody could edit a field, navigate away and
              lose it silently. */}
          <span className="ml-auto text-sm text-muted-foreground">
            {saved
              ? 'Чернетка — нічого не збережено'
              : isDirty
                ? 'Є незбережені зміни'
                : 'Без змін'}
          </span>
        </FormActions>
      </form>
    </RequiredFields>
  );
}
