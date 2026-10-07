'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarCheck, CalendarClock, Undo2 } from 'lucide-react';
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
import { setShareYear } from '@/app/(dashboard)/science-plan/record-actions';
import { attempt } from '@/lib/science/attempt';
import { formatHours } from '@/lib/science/hours';

/**
 * A CO-AUTHOR picks the навчальний рік their share counts in (owner,
 * 2026-10-02): «Перенести на 2027/2028» on a counting record, «Повернути в
 * 2026/2027» on a share already moved. The window and who may use it are the
 * server's (`setShareYear`); this only draws the button it was told to.
 *
 * Moving asks first — the hours leave this year's «Виконано» — bringing back
 * does not: it only puts the hours back where they were.
 *
 * `earlier` (owner, 2026-10-07): «Вже зараховано у 2025/2026» — the share was
 * already counted in the previous рік, on paper, and must not count twice. It
 * leaves this year the same way and counts nowhere; «Повернути» undoes it.
 */
export function ShareYearButton({
  workId,
  label,
  hoursHundredths,
  targetYear,
  currentYear,
  mode,
}: {
  workId: string;
  /** The work's one-line summary, named in the confirm. */
  label: string;
  hoursHundredths: number;
  /** Where the share goes: the next year to defer, the current one to bring back. */
  targetYear: string;
  /** The work's own навчальний рік. */
  currentYear: string;
  mode: 'defer' | 'back' | 'earlier';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function move() {
    startTransition(async () => {
      const result = await attempt(() => setShareYear({ workId, academicYear: targetYear }));
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === 'defer'
          ? `Години перенесено на ${targetYear}`
          : mode === 'earlier'
            ? `Позначено: вже зараховано у ${targetYear}`
            : `Години повернуто в ${targetYear}`
      );
      router.refresh();
    });
  }

  if (mode === 'back') {
    return (
      <Button variant="outline" size="sm" onClick={move} loading={isPending} disabled={isPending}>
        <Undo2 className="size-3.5" />
        Повернути в {targetYear}
      </Button>
    );
  }

  if (mode === 'earlier') {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarCheck className="size-3.5" />
            Вже зараховано у {targetYear}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вже зараховано у {targetYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ваші {formatHours(hoursHundredths)} год за роботу{' '}
              <span className="font-medium text-foreground">{label}</span> не рахуватимуться у{' '}
              {currentYear}, бо ви вже зарахували цю роботу у {targetYear}. Години автора та інших
              співавторів не зміняться. Передумати можна, доки {currentYear} не закрито.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            {/* Not red: undone with «Повернути» while the year is open. */}
            <AlertDialogAction variant="default" onClick={move} disabled={isPending}>
              {isPending ? 'Збереження…' : 'Так, вже зараховано'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock className="size-3.5" />
          Перенести на {targetYear}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Зарахувати години у {targetYear}?</AlertDialogTitle>
          <AlertDialogDescription>
            Ваші {formatHours(hoursHundredths)} год за роботу{' '}
            <span className="font-medium text-foreground">{label}</span> не рахуватимуться у{' '}
            {currentYear}. У {targetYear} вони з’являться самі, щойно ви збережете планування на той
            рік, — вносити роботу ще раз не потрібно. Передумати можна, доки {currentYear} не
            закрито.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          {/* Not red: nothing is lost — the hours move and can come back. */}
          <AlertDialogAction variant="default" onClick={move} disabled={isPending}>
            {isPending ? 'Перенесення…' : 'Перенести'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
