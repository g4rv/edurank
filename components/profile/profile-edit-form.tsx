'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { ownProfileSchema, type OwnProfileSchema } from '@/validations/staff';
import { updateOwnProfile } from '@/app/(dashboard)/profile/actions';

/** Empty strings, not nulls: an <input> with a null value is uncontrolled */
type FormValues = {
  phone: string;
  wosUrl: string;
  scopusUrl: string;
  googleScholarUrl: string;
  orcidId: string;
};

export function ProfileEditForm({
  defaultValues,
  isNpp,
}: {
  defaultValues: FormValues;
  /** Research profiles belong to НПП — the profile view hides them for
      administrative staff, so the form that fills them must agree. Hidden
      fields still submit their stored value, so nothing is cleared by hiding. */
  isNpp: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(ownProfileSchema as never) as never,
    defaultValues,
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updateOwnProfile(values as unknown as OwnProfileSchema);
      if ('error' in result) {
        // Nothing here belongs to one field — the resolver already reports those
        // inline, so a failure at this point is the save itself going wrong.
        toast.error(result.error);
        return;
      }
      toast.success('Збережено');
      router.push('/profile');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <FieldGroup className="flex flex-col gap-4">
          <FormField htmlFor="phone" label="Телефон" error={errors.phone}>
            <Input id="phone" placeholder="+380..." disabled={isPending} {...register('phone')} />
          </FormField>

          {isNpp && (
            <>
              <FormField
                htmlFor="wosUrl"
                label="Web of Science"
                description="Посилання на ваш профіль"
                error={errors.wosUrl}
              >
                <Input id="wosUrl" disabled={isPending} {...register('wosUrl')} />
              </FormField>

              <FormField
                htmlFor="scopusUrl"
                label="Scopus"
                description="Посилання на ваш профіль"
                error={errors.scopusUrl}
              >
                <Input id="scopusUrl" disabled={isPending} {...register('scopusUrl')} />
              </FormField>

              <FormField
                htmlFor="googleScholarUrl"
                label="Google Scholar"
                description="Посилання на ваш профіль"
                error={errors.googleScholarUrl}
              >
                <Input
                  id="googleScholarUrl"
                  disabled={isPending}
                  {...register('googleScholarUrl')}
                />
              </FormField>

              <FormField htmlFor="orcidId" label="ORCID" error={errors.orcidId}>
                <Input
                  id="orcidId"
                  placeholder="0000-0000-0000-0000"
                  disabled={isPending}
                  {...register('orcidId')}
                />
              </FormField>
            </>
          )}
        </FieldGroup>
      </div>

      <p className="text-sm text-muted-foreground">
        Решту даних профілю змінює відділ кадрів або адміністратор.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : 'Зберегти'}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/profile">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
