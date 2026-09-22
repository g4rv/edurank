'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
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
        {/* §3: red AT REST, tint as well as glyph (2026-09-22). This was
            `ghost` + `text-error`, which kept `ghost`'s own
            `hover:bg-foreground/6` — a GREY pill under a red icon on hover.

            `size="icon-sm"` replaces `size="icon"` + `className="size-7"`:
            `icon-sm` IS 28px, and it brings the smaller radius the other six
            delete buttons already had. */}
        <Button variant="destructive" size="icon-sm" aria-label="Видалити досягнення">
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
