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
        {/* §3: the destructive action is red AT REST — and since 2026-09-22 that
            is the TINT as well as the glyph. `variant="destructive"` is the same
            control the labelled «Архівувати» wears, here at icon size.

            It was `ghost` + `text-error`, which left `ghost`'s own
            `hover:bg-foreground/6` untouched — so a GREY pill arrived under a red
            icon the moment you pointed at it, in all seven delete buttons. The
            className is gone because the variant now carries all of it. */}
        <Button
          variant="destructive"
          size="icon-sm"
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
