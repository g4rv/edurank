'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LockOpen } from 'lucide-react';
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
import { unlockPlan } from '@/app/(dashboard)/science-plans/actions';

/**
 * «Відкрити» — ННВ reopens one submitted plan so its author can correct it.
 *
 * An `AlertDialog` rather than a plain button: it hands editing of a submitted
 * document back, and the person on the other end will not be told by the app —
 * ННВ is expected to have spoken to them. The confirm names who and which
 * кафедра, because this list shows a сумісник twice and the two plans are
 * different documents.
 */
export function UnlockPlanButton({
  planId,
  fullName,
  departmentName,
}: {
  planId: string;
  fullName: string;
  departmentName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleUnlock() {
    startTransition(async () => {
      const result = await unlockPlan(planId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('План відкрито для редагування');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          aria-label={`Відкрити план: ${fullName}`}
        >
          <LockOpen className="size-3.5" />
          Відкрити
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Відкрити план для редагування?</AlertDialogTitle>
          <AlertDialogDescription>
            {fullName} — {departmentName}. Після цього НПП зможе змінювати рядки плану та має
            зберегти його знову. Уже внесене виконане залишиться без змін.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleUnlock}>Відкрити</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
