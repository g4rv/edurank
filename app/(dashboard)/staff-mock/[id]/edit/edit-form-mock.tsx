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
import { AuroraButton } from '@/components/aurora/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { fullName } from '@/components/staff/profile/primitives';
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
 *
 * **The header is part of the form, not of the page.** «Зберегти» has to be
 * inside the `<form>` to submit it, and the owner wanted it up here beside the
 * name rather than in a bar at the foot (2026-09-07) — so the whole band moved
 * in. It is the profile's `IdentityBand` in shape: same card, same avatar, same
 * actions pinned to the top right, so leaving the profile to edit it does not
 * feel like arriving somewhere else.
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
        <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-card">
          <Avatar name={fullName(staff)} size="lg" />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">{fullName(staff)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Редагування профілю</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
            {/* Says whether there is anything TO save. The old bar carried this
                at the far end of the page; beside the button it answers the
                question the button raises. */}
            <span className="text-sm text-muted-foreground">
              {saved
                ? 'Чернетка — нічого не збережено'
                : isDirty
                  ? 'Є незбережені зміни'
                  : 'Без змін'}
            </span>
            {/* Nothing typed, nothing to save. The button says so itself
                instead of accepting a click, running the action and answering
                «Збережено» for a write that changed no column — which is the
                same lie the form used to tell an editor whose grants dropped
                every field they had edited. */}
            <AuroraButton type="submit" disabled={!isDirty}>
              Зберегти
            </AuroraButton>
            {/* «Скасувати» is NEVER disabled. It is the way out of this screen,
                and «no changes yet» is exactly when somebody is most likely to
                be leaving. Disabling it would take the exit away at the one
                moment it costs nothing to use. */}
            <AuroraButton asChild variant="outline">
              <Link href={`/staff-mock/${staff.id}`}>Скасувати</Link>
            </AuroraButton>
          </div>
        </div>

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
          layout="columns"
        />
      </form>
    </RequiredFields>
  );
}
