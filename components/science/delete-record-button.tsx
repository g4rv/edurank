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
import { deleteRecord } from '@/app/(dashboard)/science-plan/record-actions';

/**
 * Withdraw one's own draw. A confirm rather than a plain button: it moves the
 * year's total, and the record is the evidence that the work happened.
 *
 * The wording is careful about what actually goes. The WORK stays — its
 * identity is what stops it being entered twice, and a co-author may still be
 * drawing on it — so this says «ваш запис», not «роботу».
 */
export function DeleteRecordButton({ recordId, label }: { recordId: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRecord(recordId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис видалено');
      router.refresh();
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
        <Button variant="destructive" size="icon-sm" aria-label="Видалити запис">
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити ваш запис?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> більше не
            зараховуватиметься до ваших годин. Саму роботу не буде видалено — якщо її додали
            співавтори, вона залишиться в них.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Видалення…' : 'Видалити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
