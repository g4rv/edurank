'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
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
import { removeScienceRecord } from '@/app/(dashboard)/moderation/science-actions';

/**
 * ННВ's «Відхилити» on the наукова робота post-check feed — the same
 * discard-with-reason shape `DiscardActivityButton` uses for the rating's own
 * self-reports, redrawn with «Аврора»'s primitives (this feed is new, unlike
 * the rating's own list, which still carries the older `components/ui/*`).
 */
export function DiscardRecordButton({
  recordId,
  label,
  staffName,
}: {
  recordId: string;
  label: string;
  staffName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');

  function handleDiscard() {
    startTransition(async () => {
      const result = await removeScienceRecord(recordId, reason);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис відхилено');
      setReason('');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* `destructive`, not `outline` with the colour painted on by hand
            (2026-09-21). §3 of `docs/aurora.md`: an action that refuses or
            removes somebody's work wears the VARIANT named for what it does,
            and the variant is where the rest state, the hover and dark mode are
            decided once. */}
        <Button variant="destructive" size="sm">
          <Ban className="size-4" />
          Відхилити
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Відхилити запис?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> ({staffName}) перестане
            рахуватись у виконано. Людина побачить вказану причину; запис можна відновити.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`science-discard-reason-${recordId}`}>Причина відхилення</Label>
          <Textarea
            id={`science-discard-reason-${recordId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Наприклад: посилання веде на іншу статтю"
            maxLength={500}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDiscard} disabled={isPending || !reason.trim()}>
            {isPending ? 'Відхилення...' : 'Відхилити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
