'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
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
} from '@/components/aurora/ui/alert-dialog';
import { deleteDepartment } from '@/app/(dashboard)/departments/actions';

interface DeleteDepartmentButtonProps {
  departmentId: string;
  departmentName: string;
}

export function DeleteDepartmentButton({
  departmentId,
  departmentName,
}: DeleteDepartmentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDepartment(departmentId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Видалено');
      router.push(result.redirectTo);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* The shape every delete in the app wears — `delete-activity-button`,
            `delete-plan-row-button`, `delete-record-button`. Red at rest, not
            only on hover (owner, 2026-09-14): §3 of `docs/aurora.md` gives
            `--error` to the destructive action, and a delete that looks neutral
            until you are already pointing at it announces what it does one
            moment too late. `-strong` on hover keeps the step. */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-error hover:text-error-strong"
          aria-label={`Видалити кафедру ${departmentName}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити кафедру?</AlertDialogTitle>
          <AlertDialogDescription>
            Кафедру <span className="font-medium text-foreground">{departmentName}</span> буде
            видалено безповоротно.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Видалення...' : 'Видалити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
