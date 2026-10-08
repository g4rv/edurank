'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArchiveRestore, ArchiveX, Trash2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { Label } from '@/components/aurora/ui/label';
import { Textarea } from '@/components/aurora/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';
import { archiveStaff, deleteStaff, restoreStaff } from '@/app/(dashboard)/staff/[id]/actions';

/**
 * Archiving replaces deleting a person entirely (see archiveStaff). The dialog
 * spells out what happens, because «архівувати» on its own does not tell an
 * admin that the login stops working — nor that nothing is lost, which is the
 * part that makes it safe to click.
 */
export function ArchiveStaffButton({
  staffId,
  staffName,
  heads = [],
}: {
  staffId: string;
  staffName: string;
  /** The кафедри and факультети this person heads — they lose their head */
  heads?: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveStaff(staffId, reason);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setReason('');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* Semi-destructive, and drawn that way (owner, 2026-09-09). Archiving
            deletes nothing — every activity and every closed year survives —
            but the person leaves every list, grid and «Кнпп» in the app and is
            locked out of their own login. The soft `destructive` fill is the
            right weight for that: heavier than «Редагувати» beside it, lighter
            than the real delete beside it, which only an ADMIN has. */}
        <Button variant="destructive" size="sm">
          <ArchiveX className="size-4" />
          Архівувати
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Архівувати запис?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{staffName}</span> зникне зі списків і з
            рейтингу поточного року та більше не зможе увійти в систему. Усі бали, подання та
            закриті роки залишаться незмінними. Запис можна відновити будь-коли.
            {/* Said before, not only after: archiving takes the post away
                (owner, 2026-10-07), and the post does not come back on restore. */}
            {heads.length > 0 && (
              <span className="mt-2 block font-medium text-foreground">
                Ця людина очолює {heads.join(', ')} — після архівування там не буде керівника, доки
                адміністратор не призначить нового.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`archive-reason-${staffId}`}>Причина (необов’язково)</Label>
          <Textarea
            id={`archive-reason-${staffId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Наприклад: декретна відпустка до 2029 / звільнення"
            maxLength={500}
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleArchive} disabled={isPending}>
            {isPending ? 'Архівування...' : 'Архівувати'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The real delete — ADMIN only, and only for somebody already archived (owner,
 * 2026-10-08): archive is the bin, this empties it. For a record that should
 * never have existed, a duplicate above all — archiving alone cannot fix one,
 * the archived row still holds the email.
 *
 * The dialog says what is lost and where the safe action is, because the two
 * buttons sit side by side and «Видалити» next to «Архівувати» is exactly where
 * a wrong click happens. The person leaves the page afterwards: their record is
 * gone, and staying on it would answer 404.
 */
export function DeleteStaffButton({ staffId, staffName }: { staffId: string; staffName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteStaff(staffId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.push('/staff');
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-error-strong">
          <Trash2 className="size-4" />
          Видалити
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити запис остаточно?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{staffName}</span> буде видалено разом з
            усіма балами, поданнями та закритими роками. Це не можна скасувати і не можна відновити.
            Якщо запис може ще знадобитися — залиште його в архіві.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Видалення...' : 'Видалити остаточно'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Back on the roster: the login works again and the open year counts them */
export function RestoreStaffButton({ staffId, staffName }: { staffId: string; staffName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreStaff(staffId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArchiveRestore className="size-4" />
          Відновити
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Відновити запис?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{staffName}</span> повернеться до списків
            і до рейтингу поточного року, а вхід у систему знову працюватиме.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          {/* `default`, not the `destructive` this component defaults to.
              §10 of `docs/aurora.md` gives that default to «almost every
              confirm here», which is true — but putting somebody BACK on the
              roster is the one action on this screen that takes nothing away,
              and a red button over «Відновити» says the opposite of what it
              does. */}
          <AlertDialogAction variant="default" onClick={handleRestore} disabled={isPending}>
            {isPending ? 'Відновлення...' : 'Відновити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
