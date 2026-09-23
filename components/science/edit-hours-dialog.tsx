'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import { updateRecordHours } from '@/app/(dashboard)/science-plan/record-actions';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
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
import { FormField } from '@/components/ui/form-field';
import { DialogProblem } from '@/components/science/dialog-problem';
import { formatHours } from '@/lib/science/hours';
import { parseStake } from '@/lib/stake/units';

/**
 * «Моя частка» — change how many of a shared work's hours are mine (D46).
 *
 * Co-authors settle a split after somebody has already typed a number, so the
 * split has to be editable without deleting the запис — which would throw away
 * its files too. Offered on every SHARED work, including one nobody has joined
 * yet: its sole author may have left room and now wants it back.
 *
 * The limit is what the others hold, not the whole work — the same rule the
 * server applies inside its transaction, which is the one that decides.
 */
export function EditHoursDialog({
  recordId,
  hoursHundredths,
  totalHundredths,
  othersHundredths,
  label,
}: {
  recordId: string;
  /** My current draw. */
  hoursHundredths: number;
  /** The whole work's pool. */
  totalHundredths: number;
  /** What my co-authors hold between them — APPROVED draws only. */
  othersHundredths: number;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hours, setHours] = useState(formatHours(hoursHundredths));
  const [problem, setProblem] = useState<string | null>(null);

  const available = Math.max(0, totalHundredths - othersHundredths);

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      // A reopened dialog starts from what is saved, not from a cancelled edit.
      setHours(formatHours(hoursHundredths));
      setProblem(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    const parsed = parseStake(hours);
    if (parsed === null) {
      setProblem('Вкажіть кількість годин, наприклад 200 або 12,5');
      return;
    }
    startTransition(async () => {
      const result = await updateRecordHours({ recordId, hoursHundredths: parsed });
      if ('error' in result) {
        setProblem(result.error);
        return;
      }
      toast.success('Частку змінено');
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Моя частка годин у «${label}»`}>
          <Scale className="size-3.5" />
          Моя частка
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Моя частка годин</DialogTitle>
          <DialogDescription>
            Робота спільна: години ділять між собою співавтори. Змінюється лише ваша частка.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <FormField
              htmlFor="edit-hours"
              label="Скільки годин берете ви"
              required
              description={`Уся робота — ${formatHours(totalHundredths)} год. Співавтори вже взяли ${formatHours(othersHundredths)} год, тож ви можете взяти до ${formatHours(available)} год.`}
            >
              <Input
                id="edit-hours"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </FormField>
          </DialogBody>

          {/* The refusal sits with the submit, in the footer that does not
              scroll — see `DialogProblem`. */}
          <DialogFooter>
            <DialogProblem>{problem}</DialogProblem>
            <Button type="submit" disabled={isPending} loading={isPending}>
              {isPending ? 'Збереження…' : 'Зберегти'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
