'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { Switch } from '@/components/aurora/ui/switch';
import { staffCreateSchema, type StaffCreateSchema } from '@/validations/staff';
import { createStaff } from '@/app/(dashboard)/staff/actions';
import type { DepartmentOption } from '@/lib/queries/list-departments';
import type { DivisionOption } from '@/lib/queries/list-divisions';
import { FieldHint } from '@/components/ui/field-hint';
import { RequiredFields } from '@/components/ui/required-fields';
import {
  StaffFormFields,
  EMPTY_STAFF_FORM_VALUES,
  type RawStaffFormValues,
} from '@/components/staff/staff-form-fields';

interface CreateStaffDialogProps {
  departments: DepartmentOption[];
  divisions: DivisionOption[];
  isAdmin: boolean;
  /** ADMIN, or a division granted `partTimeDepartmentIds` */
  canEditPartTime: boolean;
}

/**
 * «Додати користувача» — the whole create form, in a dialog over the list.
 *
 * **It replaced the `/staff/new` page** (owner, 2026-09-21), which is deleted
 * rather than kept as a second way in. Two routes rendering one form is how the
 * two drift, and nothing linked to it any more — the button is here.
 *
 * So this file holds the form itself instead of wrapping a `StaffCreateForm`
 * that would have exactly one caller. §11 of `docs/aurora.md`: one caller means
 * it is not shared yet, and it lives next to its screen. The part that IS
 * shared — every field, and the rules about which of them each role may
 * touch — is `StaffFormFields`, which the edit form uses too.
 *
 * **The `<form>` wraps the body AND the footer**, not just the body. The submit
 * button lives in `DialogFooter`, outside the scroll box, and a button outside
 * its form submits nothing. Making the form the flex column between
 * `DialogContent` and its three parts is what keeps «Створити» pinned while the
 * five sections scroll under it.
 *
 * **On success it opens the new person's record** (owner, 2026-09-21), the same
 * place the page went. Closing back to the list was the alternative and is the
 * wrong one here: a record created from this form has its name and кафедра and
 * almost nothing else, so the next thing anybody does is open it.
 */
export function CreateStaffDialog({
  departments,
  divisions,
  isAdmin,
  canEditPartTime,
}: CreateStaffDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    reset,
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

  /**
   * Everything typed is dropped when the dialog closes.
   *
   * A dialog that reopens holding the last person's name is worse than one that
   * reopens empty: the fields look filled in, so the mistake is only found
   * after saving. Reopening is also the ordinary way to recover from a
   * mis-click, and recovery should not leave debris.
   */
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset(EMPTY_STAFF_FORM_VALUES);
      setSendInvite(false);
    }
  }

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
        // Closed BEFORE navigating: the dialog belongs to the list, and leaving
        // it mounted while the record streams in leaves a panel over a page it
        // is not part of.
        onOpenChange(false);
        router.push(result.redirectTo);
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast.error('Помилка сервера');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Додати користувача
        </Button>
      </DialogTrigger>

      {/* `max-w-2xl` rather than the default `max-w-lg`: this is five sections
          of two-column rows, and at 512px every row collapses to one column and
          the form doubles in length. */}
      <DialogContent className="max-w-2xl">
        <RequiredFields schema={staffCreateSchema}>
          <form onSubmit={handleSubmit(onSubmit as never)} className="flex min-h-0 flex-1 flex-col">
            {/* `flex-row`, against `DialogHeader`'s own column: the switch sits
                opposite the title rather than under it. `pr-14` on the header
                already keeps the × clear, so the switch stops short of it. */}
            <DialogHeader className="flex-row items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle>Новий співробітник</DialogTitle>
                <DialogDescription>Заповніть дані нового запису</DialogDescription>
              </div>

              {/* ADMIN only: handing out an account has never been an editor's
                  to do, so the switch is not shown to them and the server
                  ignores the flag.

                  **In the header, not at the foot of the form** (owner,
                  2026-09-21). It is not a field on the person — it is what to
                  do once they exist — and at the bottom of five scrolling
                  sections it was found only by somebody who had already
                  scrolled past everything else.

                  Its explanation is a `FieldHint` rather than the second line
                  it used to carry: a header is two lines tall, and a sentence
                  about SMTP is not worth a third on every open. */}
              {isAdmin && (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                  <Switch
                    checked={sendInvite}
                    onCheckedChange={setSendInvite}
                    disabled={isPending}
                  />
                  <span className="flex items-center gap-1.5">
                    Надіслати запрошення
                    <FieldHint>
                      Людина отримає лист із посиланням, щоб установити пароль. Інакше запрошення
                      можна надіслати пізніше з її сторінки.
                    </FieldHint>
                  </span>
                </label>
              )}
            </DialogHeader>

            <DialogBody className="space-y-4">
              <StaffFormFields
                register={register}
                control={control}
                errors={errors}
                setValue={setValue}
                // No person yet, so no distribution to show — the typed «Ставка»
                // field is what `null` turns back on.
                stakeBreakdown={null}
                isPending={isPending}
                isAdmin={isAdmin}
                canEditPartTime={canEditPartTime}
                isNpp={isNppValue}
                departments={departments}
                divisions={divisions}
                // Numbered sections read as steps while filling a blank record —
                // and in a scrolling panel they are also the only thing saying
                // how much is left.
                numbered
                // The type has to be chosen up front, whoever is creating the record
                canEditType
                // No shadow on the sections: this dialog is itself a card, and
                // §2 gives no elevation to anything nested inside one.
                flat
              />
            </DialogBody>

            <DialogFooter>
              {/* Not a `DialogClose`: it has to be `type="button"` inside a
                  form, and it must stay clickable while a save is in flight —
                  leaving is the ordinary way out of a form that is refusing to
                  submit. */}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Збереження...' : 'Створити'}
              </Button>
            </DialogFooter>
          </form>
        </RequiredFields>
      </DialogContent>
    </Dialog>
  );
}
