'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Lock, LockOpen } from 'lucide-react';
import {
  activateTemplate,
  cloneTemplate,
  closeYear,
  reopenYear,
  type RatingAdminState,
} from '@/app/(dashboard)/admin/rating/actions';
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

interface RatingYearActionsProps {
  year: number;
  status: 'OPEN' | 'CLOSED';
  isActive: boolean;
  /** Clone is offered only on the newest year — clones always create year+1 */
  isLatest: boolean;
}

export function RatingYearActions({ year, status, isActive, isLatest }: RatingYearActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<RatingAdminState>) {
    startTransition(async () => {
      const result = await action();
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {!isActive && status === 'OPEN' && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => activateTemplate(year))}
        >
          <CheckCircle2 className="size-4" />
          Активувати
        </Button>
      )}

      {isLatest && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => cloneTemplate(year))}
        >
          <Copy className="size-4" />
          Клонувати в {year + 1}
        </Button>
      )}

      {status === 'OPEN' ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              <Lock className="size-4" />
              Закрити рік
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Закрити {year} рік?</AlertDialogTitle>
              <AlertDialogDescription>
                Подання та внесення даних буде заблоковано, підсумки зафіксовано. Відхилені записи
                буде остаточно видалено (журнал аудиту збереже їх слід). За потреби рік можна буде
                відкрити знову.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Скасувати</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => closeYear(year))}>
                Закрити рік
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              <LockOpen className="size-4" />
              Відкрити рік
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Відкрити {year} рік знову?</AlertDialogTitle>
              <AlertDialogDescription>
                Подання та внесення даних знову стануть можливими. Після виправлень рік потрібно
                закрити повторно — підсумковий знімок буде перебудовано.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Скасувати</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => reopenYear(year))}>
                Відкрити рік
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
