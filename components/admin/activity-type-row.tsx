'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { updateActivityType } from '@/app/(dashboard)/admin/rating/actions';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { INPUT_SOURCE_LABELS } from '@/lib/rating/labels';
import {
  updateActivityTypeSchema,
  type UpdateActivityTypeSchema,
} from '@/validations/rating-admin';
import { cn } from '@/lib/utils';

export interface EditableActivityType {
  id: string;
  code: string;
  label: string;
  coefficient: number;
  coefficientNote: string | null;
  inputSource: 'NPP_SUBMISSION' | 'DIVISION_MANAGED' | 'PROFILE_DERIVED';
  verifyingDivisionId: string | null;
  isActive: boolean;
}

interface ActivityTypeRowProps {
  type: EditableActivityType;
  divisions: { id: string; name: string }[];
  editable: boolean;
}

export function ActivityTypeRow({ type, divisions, editable }: ActivityTypeRowProps) {
  const division = divisions.find((d) => d.id === type.verifyingDivisionId);

  return (
    <tr
      className={cn(
        'border-b transition-colors last:border-0 hover:bg-muted/20',
        !type.isActive && 'opacity-50'
      )}
    >
      <td className="px-5 py-2.5">
        <p className={cn('text-sm', !type.isActive && 'line-through')}>{type.label}</p>
        {type.coefficientNote && (
          <p className="mt-0.5 text-xs whitespace-pre-line text-muted-foreground">
            {type.coefficientNote}
          </p>
        )}
      </td>
      <td className="w-28 px-3 py-2.5 text-right text-sm font-medium tabular-nums">
        {type.coefficient}
      </td>
      <td className="w-44 px-3 py-2.5 text-xs text-muted-foreground">
        {INPUT_SOURCE_LABELS[type.inputSource]}
        {division && <span className="block">{division.name}</span>}
      </td>
      <td className="w-16 px-3 py-2.5 text-right">
        {editable && <EditDialog type={type} divisions={divisions} />}
      </td>
    </tr>
  );
}

function EditDialog({
  type,
  divisions,
}: {
  type: EditableActivityType;
  divisions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpdateActivityTypeSchema>({
    // z.coerce makes the schema's input type `unknown`, hence the cast
    resolver: standardSchemaResolver(
      updateActivityTypeSchema
    ) as unknown as Resolver<UpdateActivityTypeSchema>,
    defaultValues: {
      label: type.label,
      coefficient: type.coefficient,
      coefficientNote: type.coefficientNote ?? '',
      verifyingDivisionId: type.verifyingDivisionId ?? '',
      isActive: type.isActive,
    },
  });

  const isActive = watch('isActive');
  const divisionId = watch('verifyingDivisionId');

  function onSubmit(data: UpdateActivityTypeSchema) {
    startTransition(async () => {
      const result = await updateActivityType(type.id, data);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Збережено');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Редагувати: ${type.label}`}>
          <Pencil className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Редагувати показник</AlertDialogTitle>
          <AlertDialogDescription>
            Зміни коефіцієнта діють на нові подання — вже підтверджені бали не перераховуються.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField htmlFor={`label-${type.id}`} label="Назва" error={errors.label}>
            <Textarea id={`label-${type.id}`} rows={2} {...register('label')} />
          </FormField>

          <FormField
            htmlFor={`coefficient-${type.id}`}
            label="Коефіцієнт (балів)"
            error={errors.coefficient}
          >
            <Input
              id={`coefficient-${type.id}`}
              type="number"
              step="any"
              min="0"
              {...register('coefficient')}
            />
          </FormField>

          <FormField
            htmlFor={`note-${type.id}`}
            label="Примітка (критерії)"
            error={errors.coefficientNote as { message?: string } | undefined}
          >
            <Textarea id={`note-${type.id}`} rows={2} {...register('coefficientNote')} />
          </FormField>

          {type.inputSource === 'DIVISION_MANAGED' && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Відповідальний відділ</span>
              <Select
                value={divisionId || undefined}
                onValueChange={(v) => setValue('verifyingDivisionId', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Оберіть відділ" />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <Switch checked={isActive} onCheckedChange={(v) => setValue('isActive', v)} />
            <span className="text-sm">Показник активний</span>
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Збереження…' : 'Зберегти'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
