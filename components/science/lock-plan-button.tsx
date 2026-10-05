'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';
import { lockPlan } from '@/app/(dashboard)/science-plan/record-actions';
import { formatHours } from '@/lib/science/hours';

export interface LockRow {
  id: string;
  label: string;
  hoursHundredths: number;
}

/**
 * «Зберегти планування» — the НПП submits their plan and it stops being editable.
 *
 * An `AlertDialog`, not a `Dialog`: this is a decision, not a task, and it is
 * the one action on this screen that cannot be undone by the person taking it.
 * The confirm LISTS the whole plan, because «are you sure» about something you
 * cannot see again is not a question anybody can answer.
 *
 * Absent while the кафедра has no розподіл. The reason is on screen rather than
 * in a tooltip — the plan header's warning (`NO_RATE_DETAIL`), which since
 * 2026-10-05 also covers the disabled «Запланувати роботу».
 */
export function LockPlanButton({
  departmentId,
  rows,
  totalHundredths,
  targetHundredths,
  hasRate,
}: {
  departmentId: string;
  rows: LockRow[];
  totalHundredths: number;
  targetHundredths: number | null;
  hasRate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  const short =
    targetHundredths !== null && totalHundredths < targetHundredths
      ? targetHundredths - totalHundredths
      : 0;

  function handleLock() {
    startTransition(async () => {
      const result = await lockPlan(departmentId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('План збережено');
      router.refresh();
      setOpen(false);
    });
  }

  // No button and no sentence: the header's NO_RATE_DETAIL already says why,
  // beside the disabled «Запланувати роботу» (owner, 2026-10-05). Saying it
  // here as well put the same reason on screen twice.
  if (!hasRate) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="rounded-md">
          <Lock className="size-4" />
          Зберегти планування
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Зберегти план на рік?</AlertDialogTitle>
          <AlertDialogDescription>
            План буде показано нижче — перевірте його перед збереженням.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* The plan itself, in full. «Are you sure» about something you cannot
            see is not a question anybody can answer. */}
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <ul className="divide-y text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">{row.label}</span>
                <span className="shrink-0 text-foreground-soft tabular-nums">
                  {formatHours(row.hoursHundredths)} год
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm">
          Разом: <span className="font-semibold tabular-nums">{formatHours(totalHundredths)}</span>{' '}
          год
          {targetHundredths !== null && <> з {formatHours(targetHundredths)} потрібних</>}
        </p>

        {/* Both warnings sit right above the button they concern, not up by
            the title — «are you sure» needs its reason next to the decision,
            not scrolled away above the plan list. */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-error">
            ! Після збереження план не можна буде змінити !
          </p>
          {/* Below the norm the plan cannot be saved (owner, 2026-09-24,
              reversing D9's «shown, never blocked»). The dialog still opens, so
              the person sees the whole plan and exactly how much is missing. */}
          {short > 0 && (
            <p className="text-sm text-warning">
              Бракує {formatHours(short)} год до норми. Додайте роботи до плану — зберегти план
              нижче норми неможливо.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <Button onClick={handleLock} disabled={isPending || short > 0} loading={isPending}>
              {isPending ? 'Збереження…' : 'Так, зберегти'}
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
