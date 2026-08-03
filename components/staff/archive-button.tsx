'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArchiveRestore, ArchiveX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/alert-dialog';
import { archiveStaff, restoreStaff } from '@/app/(dashboard)/staff/[id]/actions';

/**
 * Archiving replaces deleting a person entirely (see archiveStaff). The dialog
 * spells out what happens, because «архівувати» on its own does not tell an
 * admin that the login stops working — nor that nothing is lost, which is the
 * part that makes it safe to click.
 */
export function ArchiveStaffButton({ staffId, staffName }: { staffId: string; staffName: string }) {
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
        <Button variant="outline" size="sm">
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
          <AlertDialogAction onClick={handleRestore} disabled={isPending}>
            {isPending ? 'Відновлення...' : 'Відновити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
