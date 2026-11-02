'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
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
import { checkRestoreActivity, restoreActivity } from '@/app/(dashboard)/moderation/actions';

type Check = { state: 'checking' } | { state: 'ok' } | { state: 'blocked'; message: string };

/**
 * ADMIN takes back a discard made by mistake. Asks first: the entry's score
 * returns to the person's rating at once.
 *
 * The check runs when the dialog OPENS. A restore that cannot happen — the same
 * DOI already sits in another entry of this indicator — says so inside the
 * dialog and offers only «Скасувати»; there is no confirm button to press and
 * no toast to chase.
 */
export function RestoreActivityButton({
  activityId,
  label,
  staffName,
}: {
  activityId: string;
  label: string;
  staffName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [check, setCheck] = useState<Check>({ state: 'checking' });

  function handleOpenChange(open: boolean) {
    if (!open) return;
    setCheck({ state: 'checking' });
    checkRestoreActivity(activityId)
      .then((result) =>
        setCheck('error' in result ? { state: 'blocked', message: result.error } : { state: 'ok' })
      )
      .catch(() =>
        setCheck({ state: 'blocked', message: 'Не вдалося перевірити запис. Спробуйте ще раз' })
      );
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreActivity(activityId);
      if ('error' in result) {
        // A rare race (the person entered the DOI between the check and the
        // click): the dialog is already closing, so this one is a toast.
        toast.error(result.error);
        return;
      }
      toast.success('Досягнення повернено');
      router.refresh();
    });
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2 className="size-4" />
          Повернути
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {check.state === 'blocked' ? 'Повернути не можна' : 'Повернути досягнення?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {check.state === 'blocked' ? (
              check.message
            ) : (
              <>
                <span className="font-medium text-foreground">{label}</span> ({staffName}) знову
                зараховується, а його бали повертаються до рейтингу. Причину відхилення буде
                прибрано.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          {check.state !== 'blocked' && (
            <AlertDialogAction
              onClick={handleRestore}
              disabled={isPending || check.state === 'checking'}
            >
              {isPending ? 'Повернення...' : 'Повернути'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
