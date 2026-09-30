'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { updateCoauthors } from '@/app/(dashboard)/science-plan/record-actions';
import { attempt } from '@/lib/science/attempt';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { CoauthorsField } from '@/components/science/coauthors-field';
import { DialogProblem } from '@/components/science/dialog-problem';
import { formatHours } from '@/lib/science/hours';
import {
  coauthorsProblem,
  hoursToInput,
  parseCoauthorRows,
  type CoauthorRow,
} from '@/lib/science/coauthors';
import type { CoauthorCandidate } from '@/lib/queries/list-coauthor-candidates';

/** One co-author already on the work, as the record list has it. */
export interface CurrentCoauthor {
  staffId: string;
  name: string;
  hoursHundredths: number;
  /** Hours set aside for somebody who has not saved their plan yet. */
  pending: boolean;
}

const rowsOf = (coauthors: CurrentCoauthor[]): CoauthorRow[] =>
  coauthors.map((c) => ({ staffId: c.staffId, hours: hoursToInput(c.hoursHundredths) }));

/**
 * «Співавтори» — change who a work is shared with and how many hours each one
 * gets, from the author's own record (owner, 2026-09-30).
 *
 * This is the ONE place a share changes. A colleague who was not named agrees
 * the hours with the author, and the author writes the agreement down here; a
 * co-author cannot edit their own share, so «who has how much» always has one
 * answer. The author's own hours are what is left and are not an input.
 *
 * Opens already filled in from what is saved, including people who have not
 * saved their plan yet (their hours wait for them and show as pending).
 */
export function EditCoauthorsDialog({
  workId,
  label,
  totalHundredths,
  myHundredths,
  coauthors,
  candidates,
}: {
  workId: string;
  label: string;
  /** The whole work's pool. */
  totalHundredths: number;
  /** The author's current share, for the button. */
  myHundredths: number;
  coauthors: CurrentCoauthor[];
  candidates: CoauthorCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<CoauthorRow[]>(() => rowsOf(coauthors));
  const [problem, setProblem] = useState<string | null>(null);

  // A person already on the work who is no longer in the picker's list (they
  // have since been archived) must still show by name, not as an empty row.
  const known = new Set(candidates.map((c) => c.id));
  const allCandidates: CoauthorCandidate[] = [
    ...candidates,
    ...coauthors
      .filter((c) => !known.has(c.staffId))
      .map((c) => ({ id: c.staffId, name: c.name, department: null })),
  ];

  const parsed = parseCoauthorRows(rows);
  const rowsProblem =
    'error' in parsed
      ? parsed.error
      : coauthorsProblem({ totalHundredths, authorStaffId: '', shares: parsed.shares });

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      // A reopened dialog starts from what is saved, not from a cancelled edit.
      setRows(rowsOf(coauthors));
      setProblem(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if ('error' in parsed) {
      setProblem(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await attempt(() => updateCoauthors({ workId, coauthors: parsed.shares }));
      if ('error' in result) {
        setProblem(result.error);
        return;
      }
      toast.success('Співавторів збережено');
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Співавтори роботи «${label}»`}>
          <Users className="size-3.5" />
          {/* What it opens is a split, so the split is what it shows. */}
          Співавтори:{' '}
          <span className="tabular-nums">
            {coauthors.length > 0
              ? `${coauthors.length} · моя частка ${formatHours(myHundredths)} з ${formatHours(totalHundredths)}`
              : 'немає'}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Співавтори</DialogTitle>
          <DialogDescription>
            Уся робота — {formatHours(totalHundredths)} год. Ви розподіляєте години між
            співавторами, а вам лишається решта.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <CoauthorsField
              rows={rows}
              onChange={setRows}
              candidates={allCandidates}
              poolHundredths={totalHundredths}
              problem={rowsProblem}
            />
            {coauthors.some((c) => c.pending) && (
              <p className="text-sm text-foreground-soft">
                Години тих, хто ще не зберіг план наукової роботи, чекають на них і з’являться у
                їхньому «Виконанні», щойно вони його збережуть.
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogProblem>{problem}</DialogProblem>
            <Button type="submit" disabled={isPending || rowsProblem !== null} loading={isPending}>
              {isPending ? 'Збереження…' : 'Зберегти'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
