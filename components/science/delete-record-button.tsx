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
 * The wording is careful about what actually goes, and it depends on who asks
 * (owner, 2026-09-30). A CO-AUTHOR removes only their own record — the work
 * stays with the author, so this says «ваш запис». The AUTHOR removes the whole
 * work, and with it every co-author's record and reserved hours, so it says so,
 * by number, before anything happens.
 */
export function DeleteRecordButton({
  recordId,
  label,
  isAuthor = false,
  coauthorCount = 0,
}: {
  recordId: string;
  label: string;
  /** The person entered the work — deleting it deletes it for everybody. */
  isAuthor?: boolean;
  /** How many other people hold hours on it, recorded or reserved. */
  coauthorCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRecord(recordId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(isAuthor ? 'Роботу видалено' : 'Запис видалено');
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
        <Button
          variant="destructive"
          size="icon-sm"
          aria-label={isAuthor ? 'Видалити роботу' : 'Видалити запис'}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAuthor ? 'Видалити роботу?' : 'Видалити ваш запис?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span>{' '}
            {isAuthor ? (
              coauthorCount > 0 ? (
                <>
                  буде видалено повністю — разом із записами та годинами співавторів (
                  {coauthorCount}). Вони втратять ці години, і хтось із вас має додати роботу знову.
                  Це не можна скасувати.
                </>
              ) : (
                <>буде видалено повністю. Це не можна скасувати.</>
              )
            ) : (
              <>
                більше не зараховуватиметься до ваших годин. Саму роботу не буде видалено — вона
                залишиться в автора, і ваші години повернуться до нього.
              </>
            )}
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
