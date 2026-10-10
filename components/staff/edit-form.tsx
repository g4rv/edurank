'use client';

import { useState, useTransition } from 'react';
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
import { RaiseLimitDialog } from '@/components/staff/raise-limit-dialog';
import type { LimitRaise } from '@/lib/stake/seed-allocation';
import type { StaffDetail } from '@/lib/queries/get-staff';
import { headshipOf } from '@/lib/staff/academic';
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
  /** ADMIN, and only while a rating year is open — see `WorkplacesField` */
  canEditRates: boolean;
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
  canEditRates,
}: StaffEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /**
   * A ставка per кафедра, for кафедри that have not allocated one yet.
   *
   * Starts empty rather than pre-filled from `stakeBreakdown`: a кафедра that
   * HAS a number shows it read-only, so anything typed here is by definition a
   * кафедра with nothing to pre-fill from.
   */
  const [rates, setRates] = useState<Record<string, string>>({});

  // A ставка above somebody's Макс is asked about, not refused: the server
  // saved nothing and sent back what would be raised. «Так» sends the same
  // save again, agreed.
  const [raises, setRaises] = useState<LimitRaise[] | null>(null);
  // True only between pressing «Так» and the answer — NOT while the question is
  // being opened, which would show «Збереження...» on a button nobody pressed.
  const [agreeing, setAgreeing] = useState(false);
  const [askedAbout, setAskedAbout] = useState<StaffUpdateSchema | null>(null);

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<RawStaffFormValues>({
    resolver: standardSchemaResolver(staffUpdateSchema as never),
    defaultValues: staffToFormValues(staff),
  });

  /**
   * **A typed ставка is an unsaved change too.**
   *
   * «Зберегти» is gated on react-hook-form's `isDirty`, and these live in their
   * own state because they are not fields on the person — so typing one left the
   * button disabled and the number with no way out of the form (owner,
   * 2026-09-21). Anything non-empty counts: an empty box is «not decided», which
   * is what the form already held.
   */
  const ratesDirty = Object.values(rates).some((v) => v.trim() !== '');
  const dirty = isDirty || ratesDirty;

  // eslint-disable-next-line react-hooks/incompatible-library
  const isNppValue = watch('isNpp') === 'true';

  // Not `onSubmit(data, confirmRaise = false)`: react-hook-form calls its handler
  // with the submit EVENT as a second argument, which would read as «agreed».
  function onSubmit(data: StaffUpdateSchema) {
    submit(data, false);
  }

  function submit(data: StaffUpdateSchema, confirmRaise: boolean) {
    startTransition(async () => {
      try {
        const result = await updateStaff(staffId, data, { rates, confirmRaise });
        if ('confirmRaise' in result) {
          setAskedAbout(data);
          setRaises(result.confirmRaise);
          return;
        }
        setRaises(null);
        if ('error' in result) {
          // A taken address belongs under the field, not in a toast
          if (result.field === 'email') {
            setError('email', { message: result.error }, { shouldFocus: true });
          } else {
            toast.error(result.error);
          }
        } else {
          toast.success('Збережено');
          setRates({});
          router.refresh();
        }
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast.error('Сталася помилка');
      } finally {
        setAgreeing(false);
      }
    });
  }

  return (
    <>
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
              <p className="mt-1 text-sm text-foreground-soft">Редагування профілю</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
              <span className="text-sm text-muted-foreground">
                {isPending ? 'Збереження…' : dirty ? 'Є незбережені зміни' : 'Без змін'}
              </span>
              <Button type="submit" disabled={isPending || !dirty}>
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
            rates={rates}
            onRateChange={(departmentId, value) =>
              setRates((prev) => ({ ...prev, [departmentId]: value }))
            }
            canEditRates={canEditRates}
            isPending={isPending}
            isAdmin={isAdmin}
            canEditPartTime={canEditPartTime}
            editableFields={editableFields}
            isNpp={isNppValue}
            headship={headshipOf(staff)}
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
      <RaiseLimitDialog
        raises={raises}
        pending={agreeing}
        onCancel={() => setRaises(null)}
        onConfirm={() => {
          if (!askedAbout) return;
          setAgreeing(true);
          submit(askedAbout, true);
        }}
      />
    </>
  );
}
