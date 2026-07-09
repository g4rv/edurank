'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
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
import { removeActivity } from '@/app/(dashboard)/moderation/actions';

export function DiscardActivityButton({
  activityId,
  label,
  staffName,
}: {
  activityId: string;
  label: string;
  staffName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');

  function handleDiscard() {
    startTransition(async () => {
      const result = await removeActivity(activityId, reason);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Досягнення відхилено');
      setReason('');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Ban className="size-4" />
          Відхилити
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Відхилити досягнення?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> ({staffName}) буде
            відхилено, а бали знято з рейтингу. НПП побачить вказану причину і зможе подати
            досягнення повторно.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`discard-reason-${activityId}`}>Причина відхилення</Label>
          <Textarea
            id={`discard-reason-${activityId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Наприклад: публікацію не знайдено у Scopus"
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
