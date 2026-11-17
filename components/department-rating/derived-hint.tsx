'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
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
} from '@/components/aurora/ui/dialog';
import type { MatchKind } from '@/lib/department-rating/group-works';
import type { DepartmentDerived, DerivedLine } from '@/lib/queries/get-department-derived';

const MATCHED_BY: Record<MatchKind, string> = {
  isbn: 'однаковий ISBN',
  doi: 'однаковий DOI',
  link: 'однакове посилання',
  number: 'однаковий номер',
  title: 'однакова назва',
  similar: 'схожа назва',
};

/**
 * Under a report line: what the staff's personal ratings hold for it (owner,
 * 2026-11-16). A FULL line offers its count — «Використати N», or «Замінити на N»
 * when the box holds another number; a PARTIAL one is a hint that needs a
 * person's check. Nothing is written by itself — the box keeps whatever the
 * head types.
 */
export function DerivedHint({
  itemNumber,
  label,
  line,
  totals,
  current,
  canAccept,
  onAccept,
}: {
  itemNumber: string;
  label: string;
  line: DerivedLine;
  totals: Pick<DepartmentDerived, 'staffCount'>;
  /** What the box holds now, as text — '' when empty */
  current: string;
  canAccept: boolean;
  onAccept: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const full = line.coverage === 'FULL';
  const count = String(line.count);
  const matches = current === count;
  const differs = current !== '' && !matches;

  // Nothing found: one quiet line, no box — a report has many such lines and a
  // box under each would bury the ones that have something (owner, 2026-11-17).
  if (line.count === 0) {
    return <p className="mt-1 text-xs text-foreground-soft">У рейтингу НПП нічого не знайдено</p>;
  }

  return (
    // Grouped and named (owner, 2026-11-17: «Прийняти» / «Переглянути» read as
    // loose buttons, unclear about what and where). The box says where the
    // number comes from, the button says what it does to the report.
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5">
        {full && matches ? (
          <Check className="size-3.5 shrink-0 text-success" aria-hidden />
        ) : (
          <Sparkles className="size-3.5 shrink-0 text-brand-strong" aria-hidden />
        )}
        <span>
          {!full ? (
            <>
              Підказка з рейтингу НПП: знайдено <strong className="tabular-nums">{count}</strong>,
              можливо, більше — перевірте й впишіть самі
            </>
          ) : matches ? (
            <>
              Збігається з рейтингом НПП: <strong className="tabular-nums">{count}</strong>
            </>
          ) : differs ? (
            <>
              У рейтингу НПП — <strong className="tabular-nums">{count}</strong>, у звіті —{' '}
              <strong className="tabular-nums">{current}</strong>
            </>
          ) : (
            <>
              Автозаповнення з рейтингу НПП: <strong className="tabular-nums">{count}</strong>
            </>
          )}
        </span>
      </span>
      {line.needsCheck > 0 && <Badge tone="warn">схожі назви: {line.needsCheck}</Badge>}
      <span className="flex flex-wrap items-center gap-2">
        {full && canAccept && !matches && (
          <Button type="button" variant="outline" size="xs" onClick={() => onAccept(line.count)}>
            {differs ? `Замінити на ${count}` : `Використати ${count}`}
          </Button>
        )}
        <Button type="button" variant="link" size="xs" onClick={() => setOpen(true)}>
          Переглянути роботи ({line.works.length})
        </Button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Пункт {itemNumber}: роботи з рейтингу НПП</DialogTitle>
            <DialogDescription>
              {label}
              <br />
              Робіт: {line.count} · авторів: {line.authorCount} з {totals.staffCount} НПП
              {line.needsCheck > 0 && ` · перевірте схожі назви: ${line.needsCheck}`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ol className="flex flex-col gap-3">
              {line.works.map((work, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-6 shrink-0 text-right text-foreground-soft tabular-nums">
                    {i + 1}.
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="break-words">{work.title}</span>
                    <span className="text-xs text-foreground-soft">
                      {work.authors.map((author, j) => (
                        <span key={author.staffId}>
                          {j > 0 && ', '}
                          <Link
                            href={`/staff/${author.staffId}/rating`}
                            className="text-brand hover:underline"
                          >
                            {author.name}
                          </Link>
                        </span>
                      ))}
                      {work.matchedBy &&
                        ` · ${MATCHED_BY[work.matchedBy]}, записів: ${work.entryCount}`}
                    </span>
                    {work.needsCheck && (
                      <div className="flex flex-col gap-1 rounded-md bg-warning-surface px-3 py-2 text-xs">
                        <span className="font-medium text-warning">
                          Об’єднано за схожою назвою — перевірте, чи це одна робота:
                        </span>
                        <ul className="list-disc pl-4 text-foreground-soft">
                          {work.variants.map((variant, k) => (
                            <li key={k} className="break-words">
                              {variant}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </DialogBody>
          <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
            <p className="text-xs text-foreground-soft">
              Враховано лише штатних НПП кафедри. Число у звіті вирішуєте ви — список лише допомагає
              перевірити.
            </p>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Закрити
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
