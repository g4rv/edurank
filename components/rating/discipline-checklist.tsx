'use client';

import { Check, Circle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { progressText } from '@/lib/disciplines/assigned';
import { cn } from '@/lib/utils';
import type { DisciplineItem } from '@/lib/rating/rating-gate';

/**
 * The disciplines the departments assigned to this НПП for the year, with which
 * of them 5.1 already answers (owner, 2026-11-19). A status, so it carries the
 * warning / success tokens (§3 of docs/aurora.md). Nothing here blocks anything —
 * the year is judged when it closes.
 *
 * **One row, and the list in a popup** (owner, 2026-11-23: eighteen lines were
 * overwhelming, and the first answer — a panel that unfolds in the page — was
 * still a dropdown pushing the page about). The row says the progress and what the
 * close of the year will do; «Показати список» opens a dialog with every
 * discipline, the ones still owed first.
 */
export function DisciplineChecklist({
  items,
  ofOther = false,
}: {
  items: DisciplineItem[];
  /** An admin or editor reading somebody else's rating: the wording speaks of «they» */
  ofOther?: boolean;
}) {
  if (items.length === 0) return null;

  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;
  // The ones still owed first; each group keeps the person's own (alphabetical) order
  const ordered = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
  const warning = ofOther
    ? 'Без запису для кожної до закриття рейтингового року бали за всі інші пункти не буде зараховано.'
    : 'Додайте запис для кожної. Без цього до закриття рейтингового року бали за всі інші пункти не буде зараховано.';

  return (
    <section
      aria-label="Дисципліни для пункту 5.1"
      className={cn(
        'rounded-lg border px-4 py-3',
        complete ? 'bg-success-surface' : 'bg-warning-surface'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-start gap-2 font-medium',
              complete ? 'text-success' : 'text-warning'
            )}
          >
            {complete ? (
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            {complete
              ? `Усі дисципліни заповнено (${progressText(done, items.length)})`
              : `Заповнено ${progressText(done, items.length)} дисциплін`}
          </p>
          {!complete && <p className="mt-0.5 pl-6 text-sm text-warning">{warning}</p>}
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0">
              Показати список
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Дисципліни для пункту 5.1</DialogTitle>
              <DialogDescription>
                {complete
                  ? `Усі дисципліни заповнено (${progressText(done, items.length)}).`
                  : `Заповнено ${progressText(done, items.length)} дисциплін. ${warning}`}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <ul className="space-y-1.5">
                {ordered.map((i) => (
                  <li key={i.name} className="flex items-start gap-2 text-sm">
                    {i.done ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    )}
                    <span>
                      {i.name}
                      {i.done && i.notLecturer && (
                        <span className="text-muted-foreground"> — не лектор</span>
                      )}
                      {!i.done && <span className="text-warning"> — немає запису</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Закрити
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
