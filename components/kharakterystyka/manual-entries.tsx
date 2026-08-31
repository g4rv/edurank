'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import {
  addKharakterystykaEntry,
  deleteKharakterystykaEntry,
} from '@/app/(dashboard)/staff/[id]/kharakterystyka/actions';
import {
  kharakterystykaEntrySchema,
  type KharakterystykaEntrySchema,
} from '@/validations/kharakterystyka';

export interface ManualEntry {
  id: string;
  position: number;
  year: number;
  text: string;
  count: number;
}

/**
 * Typing evidence for one п.38 position.
 *
 * Everything else in this document is derived and cannot be edited — see the
 * rule at the top of `lib/kharakterystyka/build.ts`. This is the exception, and
 * it exists because two positions have no indicator at all: п.15 (робота зі
 * школярами) and п.20 (практичний досвід), which rendered as rows nobody could
 * ever fill. It is offered on the other positions too, for the years the app
 * never held a rating for.
 *
 * Imported rows are deliberately NOT listed here. They are replaced wholesale
 * every time the importer runs, so a delete button on one would undo itself on
 * the next run and look like a bug.
 */
export function ManualEntries({
  staffId,
  position,
  entries,
  minYear,
  maxYear,
}: {
  staffId: string;
  position: number;
  entries: ManualEntry[];
  minYear: number;
  maxYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteKharakterystykaEntry(id);
      if (result && 'error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис вилучено');
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-1.5">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-2 rounded-md border border-dashed px-2 py-1.5"
        >
          <div className="min-w-0 flex-1 text-xs">
            <span className="whitespace-pre-line">{entry.text}</span>{' '}
            <span className="text-muted-foreground">
              ({entry.year}
              {entry.count > 1 ? `, ${entry.count} од.` : ''})
            </span>
          </div>
          <button
            type="button"
            onClick={() => remove(entry.id)}
            disabled={pending}
            aria-label="Вилучити запис"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        Додати запис
      </Button>

      <AddEntryDialog
        open={open}
        onOpenChange={setOpen}
        staffId={staffId}
        position={position}
        minYear={minYear}
        maxYear={maxYear}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function AddEntryDialog({
  open,
  onOpenChange,
  staffId,
  position,
  minYear,
  maxYear,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  position: number;
  minYear: number;
  maxYear: number;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<KharakterystykaEntrySchema>({
    resolver: standardSchemaResolver(kharakterystykaEntrySchema as never) as never,
    defaultValues: { staffId, position, year: maxYear, text: '', count: 1 },
  });

  function onSubmit(values: KharakterystykaEntrySchema) {
    startTransition(async () => {
      const result = await addKharakterystykaEntry(values);
      if (result && 'error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис додано');
      reset({ staffId, position, year: maxYear, text: '', count: 1 });
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Запис до позиції {position}</AlertDialogTitle>
            <AlertDialogDescription>
              Текст потрапить у документ так, як його написано. Рік має бути в межах {minYear}–
              {maxYear}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <FormField htmlFor="entry-year" label="Рік" error={errors.year}>
              <Input
                id="entry-year"
                type="number"
                min={minYear}
                max={maxYear}
                disabled={pending}
                {...register('year')}
              />
            </FormField>
            <FormField
              htmlFor="entry-count"
              label="Кількість одиниць"
              description="Скільки позицій закриває цей запис"
              error={errors.count}
            >
              <Input
                id="entry-count"
                type="number"
                min={1}
                max={5}
                disabled={pending}
                {...register('count')}
              />
            </FormField>
          </div>

          <FormField htmlFor="entry-text" label="Дані підтвердження" error={errors.text}>
            <Controller
              name="text"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="entry-text"
                  rows={5}
                  disabled={pending}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  aria-invalid={!!errors.text}
                />
              )}
            />
          </FormField>

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Скасувати
            </AlertDialogCancel>
            <Button type="submit" disabled={pending}>
              Зберегти
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
