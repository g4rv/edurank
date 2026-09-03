'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { formatBonus } from '@/lib/stake/units';
import type { AdmittedStudentRow } from '@/lib/queries/list-admitted-students';
import {
  claimantsFor,
  deleteAdmittedStudent,
  type Claimant,
} from '@/app/(dashboard)/admin/students/actions';

/**
 * Removing one здобувач, and every claim that names them.
 *
 * Two steps, because the warning quotes real numbers. Opening the dialog asks
 * the server who claimed this student and what each of them loses; only then is
 * «Видалити» live. Confirming before that answer arrives is exactly the click
 * this dialog exists to prevent.
 *
 * The claimants are fetched ON OPEN rather than with the row: thirty rows would
 * otherwise be thirty extra queries on every page of the register.
 */
export function DeleteAdmittedStudent({ student }: { student: AdmittedStudentRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [claimants, setClaimants] = useState<Claimant[] | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setClaimants(null);
      return;
    }
    setClaimants(null);
    startTransition(async () => {
      const result = await claimantsFor(student.id);
      if ('error' in result) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setClaimants(result.claimants);
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteAdmittedStudent(student.id);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success('Здобувача видалено');
      router.refresh();
    });
  }

  const claimed = claimants !== null && claimants.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Видалити: ${student.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити здобувача?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span className="font-medium text-foreground">{student.name}</span>
                <br />
                {student.speciality} · {STUDY_FORM_LABELS[student.form]} ·{' '}
                {STUDENT_FUNDING_LABELS[student.funding]}
              </p>

              {claimants === null && <p>Перевіряємо заявки…</p>}

              {claimed && (
                // Amber is the project's «needs attention», and this is a status
                // indicator rather than decoration — the one place off the chart
                // palette where a hue is allowed.
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-400">
                  <p className="font-medium">
                    Цього здобувача вже заявили. Їхні заявки буде видалено разом із ним.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {claimants.map((c, i) => (
                      <li key={`${c.staffName}-${i}`}>
                        {c.staffName} —{' '}
                        {c.loses > 0
                          ? `підтверджено, втратить ${formatBonus(c.loses)} ст.`
                          : 'очікує, балів не втрачає'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Скасувати</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onDelete}
            // Never live before the check has answered.
            disabled={pending || claimants === null}
          >
            {pending ? 'Видалення…' : 'Видалити'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
