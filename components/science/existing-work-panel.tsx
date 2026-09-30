'use client';

import { CalendarClock, Users } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { DialogBody, DialogFooter } from '@/components/aurora/ui/dialog';
import type { WorkConflict } from '@/app/(dashboard)/science-plan/record-actions';

/**
 * The work is already in the system — who has it, and what to do about it.
 *
 * D17 used to turn this refusal into an offer to JOIN and take a share. Since
 * 2026-09-30 nobody adds themselves to somebody else's work: the person who
 * entered it names the co-authors and their hours, so a colleague who was left
 * off is sent to that person. There is nothing to press here but «Назад», on
 * purpose — a button that could only refuse is worse than none.
 *
 * A work from a рік that is no longer open is a different sentence: nothing
 * about it can change, and the author is not the one to ask.
 */
export function ExistingWorkPanel({
  conflict,
  onBack,
}: {
  conflict: WorkConflict;
  onBack: () => void;
}) {
  const fromOtherYear = conflict.fromYear !== null;

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
          {fromOtherYear && (
            // «Додано:», not «Додав …» — `initials` already ends in a full stop,
            // and the verb would have to agree with a gender the app does not
            // know.
            <p className="mt-1.5 text-sm text-foreground-soft">Додано: {conflict.createdByName}</p>
          )}
        </div>

        {fromOtherYear ? (
          <p className="text-sm text-foreground-soft">
            Години за неї нараховуються в тому навчальному році. Якщо роботу мали зарахувати
            цьогоріч, зверніться до ННВ.
          </p>
        ) : (
          <p className="text-sm text-foreground-soft">
            Вас не вказано серед співавторів цієї роботи. Якщо ви її співавтор, домовтеся про свої
            години з {conflict.createdByName} — автор розподіляє години між співавторами у себе в
            записі, кнопкою «Співавтори».
          </p>
        )}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          Назад
        </Button>
      </DialogFooter>
    </>
  );
}
