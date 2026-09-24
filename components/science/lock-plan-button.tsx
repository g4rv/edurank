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
 * «Зберегти план» — the НПП submits their plan and it stops being editable.
 *
 * An `AlertDialog`, not a `Dialog`: this is a decision, not a task, and it is
 * the one action on this screen that cannot be undone by the person taking it.
 * The confirm LISTS the whole plan, because «are you sure» about something you
 * cannot see again is not a question anybody can answer.
 *
 * Disabled while the кафедра has no розподіл, with the reason on screen rather
 * than in a tooltip — on 2026-09-15 that was 306 of 328 НПП, so it is the
 * ordinary September state and deserves a sentence, not a mystery.
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

  if (!hasRate) {
    return (
      <p className="text-sm text-foreground-soft">
        План можна буде зберегти, коли на кафедрі визначать вашу ставку.
      </p>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost">
          <Lock className="size-4" />
          Зберегти план
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Зберегти план на рік?</AlertDialogTitle>
          <AlertDialogDescription>
            Після збереження план не можна буде змінити!
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

        {/* Shown, never blocking — the same rule the ставки grid follows for
            overspending, and D9 for a plan below its target. */}
        {short > 0 && (
          <p className="text-sm text-warning">
            Бракує {formatHours(short)} год до норми. Зберегти все одно можна, але ННВ це побачить.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <Button onClick={handleLock} disabled={isPending} loading={isPending}>
            {isPending ? 'Збереження…' : 'Так, зберегти'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
