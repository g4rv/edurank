'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Controller, useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
// «Аврора» controls: these are the same nine fields the staff form uses, and a
// shadcn input beside an Аврора one is the half-swapped look the redesign
// exists to end.
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import { AvatarEditor } from '@/components/profile/avatar-editor';
import { Input } from '@/components/aurora/ui/input';
import { TelInput } from '@/components/aurora/ui/tel-input';
import { OrcidInput } from '@/components/aurora/ui/orcid-input';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { ownProfileSchema, type OwnProfileSchema } from '@/validations/staff';
import { updateOwnProfile } from '@/app/(dashboard)/profile/actions';
import { uploadAvatar } from '@/components/profile/upload-avatar';
import { RequiredFields } from '@/components/ui/required-fields';

/** Empty strings, not nulls: an <input> with a null value is uncontrolled */
type FormValues = {
  phone: string;
  wosUrl: string;
  scopusUrl: string;
  googleScholarUrl: string;
  orcidId: string;
};

export function ProfileEditForm({
  name,
  avatarSrc,
  canEditAvatar,
  defaultValues,
}: {
  /** Whose record this is — the header is the same one `/staff/[id]/edit` uses. */
  name: string;
  /** The photo's URL, or null for the initials */
  avatarSrc: string | null;
  /** ADMIN only for now — see `canSetOwnAvatar` */
  canEditAvatar: boolean;
  defaultValues: FormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A framed photo waiting for «Зберегти». It lives here, not in the editor, so
  // the save button can see it: a photo is part of what is saved, and «Зберегти»
  // must light up for a photo alone. Nothing is uploaded until that button.
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null);
  const previewUrl = useRef<string | null>(null);

  // Object URLs are not garbage collected; release the last one on the way out.
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    []
  );

  function pickAvatar(blob: Blob) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(blob);
    previewUrl.current = url;
    setAvatar({ blob, url });
  }

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(ownProfileSchema as never) as never,
    defaultValues,
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      // The fields first, then the photo: the fields are the record, and a photo
      // that cannot be uploaded (R2 down, a lost connection) must not cost the
      // person the phone number they just typed.
      if (isDirty) {
        const result = await updateOwnProfile(values as unknown as OwnProfileSchema);
        if ('error' in result) {
          // Nothing here belongs to one field — the resolver already reports those
          // inline, so a failure at this point is the save itself going wrong.
          toast.error(result.error);
          return;
        }
      }

      if (avatar) {
        const uploaded = await uploadAvatar(avatar.blob);
        if ('error' in uploaded) {
          // Say what actually happened to each part, and stay on the page: the
          // framed photo is still here to try again.
          toast.error(
            isDirty ? `Дані збережено, але фото — ні. ${uploaded.error}` : uploaded.error
          );
          return;
        }
      }

      toast.success('Збережено');
      router.push('/profile');
      router.refresh();
    });
  }

  // The fields OR the photo: either alone is a change worth saving.
  const changed = isDirty || avatar !== null;

  return (
    <RequiredFields schema={ownProfileSchema}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* The actions sit in a header beside the title, the way the staff form
            does — a bar at the foot puts them furthest from the thing they act
            on, and on a form this short it is off the bottom of the card.

            «Зберегти» is disabled until something is typed; «Скасувати» never
            is, because it is the way out and «no changes yet» is exactly when
            somebody is most likely to want it. */}
        <Card className="flex flex-wrap items-center gap-5">
          <AvatarEditor
            name={name}
            src={avatarSrc}
            previewUrl={avatar?.url ?? null}
            canEdit={canEditAvatar}
            disabled={isPending}
            onPick={pickAvatar}
          />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">{name}</h1>
            <p className="mt-1 text-sm text-foreground-soft">Редагування профілю</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
            <span className="text-sm text-muted-foreground">
              {isPending ? 'Збереження…' : changed ? 'Є незбережені зміни' : 'Без змін'}
            </span>
            <Button type="submit" disabled={isPending || !changed}>
              Зберегти
            </Button>
            <Button asChild variant="outline">
              <Link href="/profile">Скасувати</Link>
            </Button>
          </div>
        </Card>

        {/* Two cards, not one — and two columns that each FLOW rather than a
            grid. A grid row is as tall as its tallest cell, so «Контакти» with
            one field would either stretch to match four profile links or sit
            with a hole under it. `StaffFormFields` reaches the same conclusion
            for the same reason, and the two forms now stack their cards alike.

            Телефон left, the profiles right (owner, 2026-09-08): a phone number
            is a contact and the four links are one list of the same kind of
            thing, and folding them together made «Контакти та профілі» a card
            with two subjects. */}
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <div className="flex w-full flex-1 flex-col gap-4">
            <Card title="Контакти">
              <FieldGroup className="flex flex-col gap-4">
                <FormField htmlFor="phone" label="Телефон" error={errors.phone}>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <TelInput
                        id="phone"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isPending}
                        aria-invalid={!!errors.phone}
                      />
                    )}
                  />
                </FormField>
              </FieldGroup>
            </Card>
          </div>

          <div className="flex w-full flex-1 flex-col gap-4">
            <Card title="Наукові профілі">
              <FieldGroup className="flex flex-col gap-4">
                <FormField htmlFor="wosUrl" label="Web of Science" error={errors.wosUrl}>
                  <Input
                    id="wosUrl"
                    placeholder="Посилання на ваш профіль"
                    disabled={isPending}
                    {...register('wosUrl')}
                  />
                </FormField>

                <FormField htmlFor="scopusUrl" label="Scopus" error={errors.scopusUrl}>
                  <Input
                    id="scopusUrl"
                    placeholder="Посилання на ваш профіль"
                    disabled={isPending}
                    {...register('scopusUrl')}
                  />
                </FormField>

                <FormField
                  htmlFor="googleScholarUrl"
                  label="Google Scholar"
                  error={errors.googleScholarUrl}
                >
                  <Input
                    id="googleScholarUrl"
                    placeholder="Посилання на ваш профіль"
                    disabled={isPending}
                    {...register('googleScholarUrl')}
                  />
                </FormField>

                <FormField htmlFor="orcidId" label="ORCID" error={errors.orcidId}>
                  {/* Controlled: the field reformats on every keystroke, which an
                  uncontrolled input cannot do without the caret jumping. */}
                  <Controller
                    name="orcidId"
                    control={control}
                    render={({ field }) => (
                      <OrcidInput
                        id="orcidId"
                        disabled={isPending}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </FormField>
              </FieldGroup>
            </Card>
          </div>
        </div>
      </form>
    </RequiredFields>
  );
}
