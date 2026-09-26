'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Users } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { Label } from '@/components/aurora/ui/label';
import { DialogBody, DialogFooter } from '@/components/aurora/ui/dialog';
import { joinWork, type WorkConflict } from '@/app/(dashboard)/science-plan/record-actions';
import { formatHours } from '@/lib/science/hours';
import { parseStake } from '@/lib/stake/units';

/**
 * D17 in practice — a refusal turned into an offer.
 *
 * When the work already exists, the save is not an error and the dialog does
 * not close. It swaps to this: who has the work, what it is, how much of its
 * pool is free, and a box to take a share.
 *
 * The cap on the hours box is a CONVENIENCE. `joinWork` re-reads the drawn sum
 * inside its transaction and refuses there — two co-authors who both saw «50
 * год залишилось» must not both take them, and a client cap cannot promise
 * that.
 */
export function JoinWorkPanel({
  conflict,
  departmentId,
  planRowId,
  onDone,
  onCancel,
}: {
  conflict: WorkConflict;
  departmentId: string;
  planRowId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Defaults to everything that is left: the commonest case is two authors, and
  // the second one taking the remainder needs no arithmetic from them.
  const [hours, setHours] = useState(() => formatHours(conflict.remainingHundredths));
  const [problem, setProblem] = useState<string | null>(null);

  // A work from a рік that is no longer open: nothing here can be drawn, so
  // the panel explains instead of offering. See `WorkConflict.fromYear`.
  const fromOtherYear = conflict.fromYear !== null;
  const nothingLeft = conflict.remainingHundredths === 0;

  function handleJoin() {
    // `parseStake` reads «12,5» as well as «12.5» — the same two-decimal,
    // comma-or-dot parser every ставка field in the app uses, and hours are
    // held in the same integer hundredths.
    const parsed = parseStake(hours);
    if (parsed === null) {
      setProblem('Вкажіть кількість годин, наприклад 50 або 12,5');
      return;
    }
    setProblem(null);
    startTransition(async () => {
      const result = await joinWork({
        workId: conflict.workId,
        departmentId,
        hoursHundredths: parsed,
        planRowId,
      });
      if ('error' in result) {
        setProblem(result.error);
        return;
      }
      if ('conflict' in result) {
        setProblem('Ви вже додали цю роботу');
        return;
      }
      toast.success('Роботу додано до виконаного');
      router.refresh();
      onDone();
    });
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <div className="rounded-lg border bg-warning-surface px-4 py-3">
          <p className="text-warning-strong flex items-center gap-2 font-medium">
            {fromOtherYear ? (
              <CalendarClock className="size-4 shrink-0" />
            ) : (
              <Users className="size-4 shrink-0" />
            )}
            {fromOtherYear
              ? `Цю роботу внесено у ${conflict.fromYear} н.р.`
              : `Цю роботу вже додав ${conflict.createdByName}`}
          </p>
          <p className="mt-1 text-sm text-foreground">{conflict.summary}</p>
          {fromOtherYear ? (
            <>
              {/* «Додано:», not «Додав …» — `initials` already ends in a full
                  stop, so a sentence built around it read «Єрічева Т. Ю..»,
                  and the verb would have to agree with a gender the app does
                  not know. */}
              <p className="mt-1.5 text-sm text-foreground-soft">
                Додано: {conflict.createdByName}
              </p>
              <p className="mt-1 text-sm text-foreground-soft">
                Години за неї нараховуються в тому навчальному році, тому приєднатися до неї зараз
                не можна.
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-foreground-soft">
              Залишилось{' '}
              <span className="font-medium text-foreground">
                {formatHours(conflict.remainingHundredths)}
              </span>{' '}
              з {formatHours(conflict.totalHundredths)} год
            </p>
          )}
        </div>

        {fromOtherYear ? (
          <p className="text-sm text-foreground-soft">
            Якщо роботу мали зарахувати цьогоріч, зверніться до ННВ.
          </p>
        ) : nothingLeft ? (
          <p className="text-sm text-foreground-soft">
            Усі години цієї роботи вже розподілені між співавторами. Якщо це помилка, зверніться до
            того, хто її додав, або до ННВ.
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="join-hours">Скільки годин ви берете</Label>
            <Input
              id="join-hours"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-describedby={problem ? 'join-hours-error' : undefined}
              aria-invalid={problem ? true : undefined}
            />
            {/* Inline, under the field it belongs to — never a toast for
                something a field can show itself. */}
            {problem && (
              <p id="join-hours-error" className="text-sm text-error-strong">
                {problem}
              </p>
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Назад
        </Button>
        {/* No «Приєднатися» at all for another рік's work — a button that can
            only refuse is worse than no button. */}
        {!fromOtherYear && (
          <Button
            type="button"
            onClick={handleJoin}
            disabled={isPending || nothingLeft}
            loading={isPending}
          >
            {isPending ? 'Збереження…' : 'Приєднатися'}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
