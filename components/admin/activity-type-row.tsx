'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteActivityType } from '@/app/(dashboard)/admin/rating/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ActivityTypeDialog,
  type ActivityTypeDraft,
} from '@/components/admin/activity-type-dialog';
import { INPUT_SOURCE_LABELS } from '@/lib/rating/labels';
import { cn } from '@/lib/utils';

export interface EditableActivityType extends ActivityTypeDraft {
  id: string;
  /** How many activities already reference this indicator (0 → it may be deleted) */
  activityCount: number;
}

interface ActivityTypeRowProps {
  templateId: string;
  type: EditableActivityType;
  divisions: { id: string; name: string }[];
  editable: boolean;
}

export function ActivityTypeRow({ templateId, type, divisions, editable }: ActivityTypeRowProps) {
  const division = divisions.find((d) => d.id === type.verifyingDivisionId);
  const [editing, setEditing] = useState(false);

  return (
    <tr
      className={cn(
        'border-b transition-colors last:border-0 hover:bg-muted/20',
        !type.isActive && 'opacity-50'
      )}
    >
      <td className="w-16 px-3 py-2.5 align-top text-xs text-muted-foreground tabular-nums">
        {type.itemNumber}
      </td>
      <td className="px-2 py-2.5">
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
      <td className="w-24 px-3 py-2.5 text-right">
        {editable && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              aria-label={`Редагувати: ${type.label}`}
            >
              <Pencil className="size-4" />
            </Button>
            <DeleteButton type={type} />
            <ActivityTypeDialog
              templateId={templateId}
              draft={type}
              divisions={divisions}
              open={editing}
              onOpenChange={setEditing}
            />
          </div>
        )}
      </td>
    </tr>
  );
}

function DeleteButton({ type }: { type: EditableActivityType }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // An indicator that already holds submissions is never deleted — those rows
  // are somebody's rating history. Deactivating is the way to retire it.
  const hasData = type.activityCount > 0;

  function onDelete() {
    startTransition(async () => {
      const result = await deleteActivityType(type.id);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Показник видалено');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={hasData}
          aria-label={
            hasData
              ? `За показником «${type.label}» вже є записи — його можна лише вимкнути`
              : `Видалити: ${type.label}`
          }
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити показник?</AlertDialogTitle>
          <AlertDialogDescription>
            «{type.label}» буде вилучено з цього року. Інші роки не зміняться.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} disabled={isPending}>
            {isPending ? 'Видалення…' : 'Видалити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
