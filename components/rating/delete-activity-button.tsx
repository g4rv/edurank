'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { deleteActivity } from '@/app/(dashboard)/achievements/actions';

export function DeleteActivityButton({ activityId, label }: { activityId: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteActivity(activityId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Досягнення видалено');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // Red at rest, not only on hover (owner, 2026-09-14). §3 gives
          // `--error` to the destructive action, and a delete that looks
          // neutral until you are already pointing at it announces what it
          // does one moment too late. `-strong` on hover keeps the step.
          className="size-7 text-error hover:text-error-strong"
          aria-label="Видалити досягнення"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити досягнення?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> буде видалено безповоротно,
            а бали знято з рейтингу.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Видалення...' : 'Видалити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
