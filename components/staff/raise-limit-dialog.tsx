'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/aurora/ui/alert-dialog';
import { formatStake } from '@/lib/stake/units';
import type { LimitRaise } from '@/lib/stake/seed-allocation';

/**
 * «Ця ставка більша за максимум» — asked when ADMIN types a ставка above the
 * person's Макс on a кафедра (owner, 2026-10-08).
 *
 * ADMIN may set any ставка and there is no upper limit; the caution is this
 * question. Saying yes sends the same save again with `confirmRaise`, and the
 * server moves the ceiling up to the typed number. Saying no keeps the form as
 * it is, so the number can be corrected. Nothing was saved before the answer —
 * the server rolled the whole save back.
 *
 * The server decides, not this popup: a save without the agreement never raises
 * anything, whatever the client sends.
 *
 * `raises === null` means nothing is being asked.
 */
export function RaiseLimitDialog({
  raises,
  pending,
  onConfirm,
  onCancel,
}: {
  raises: LimitRaise[] | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={raises !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Підвищити максимум ставки?</AlertDialogTitle>
          <AlertDialogDescription>
            Ця ставка більша за максимум, дозволений цій людині. Якщо погодитесь, максимум зміниться
            до введеного значення:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1 text-sm">
          {raises?.map((r) => (
            <li key={r.departmentId}>
              <span className="font-medium text-foreground">«{r.departmentName}»</span> — з{' '}
              {formatStake(r.fromHundredths)} до {formatStake(r.toHundredths)}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          {/* `default`, not the destructive red these dialogs usually carry: raising
              a ceiling takes nothing away, and it is the person's own decision. */}
          <AlertDialogAction variant="default" onClick={onConfirm} disabled={pending}>
            {pending ? 'Збереження...' : 'Так, підвищити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
