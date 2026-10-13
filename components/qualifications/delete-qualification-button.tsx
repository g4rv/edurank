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
import { deleteQualification } from '@/app/(dashboard)/qualifications/actions';

/**
 * Deleting a record is a confirm, not a plain button: it takes the scan with it
 * and nothing brings either back. Red at rest (aurora.md §3) — the variant
 * carries the tint, the glyph and the hover.
 */
export function DeleteQualificationButton({
  qualificationId,
  label,
  hasFile,
}: {
  qualificationId: string;
  /** The record's topic — what the confirm names. */
  label: string;
  hasFile: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteQualification(qualificationId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис видалено');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="icon-sm" aria-label={`Видалити запис «${label}»`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити запис?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> буде видалено
            {hasFile ? ' разом із доданим файлом' : ''}. Це не можна скасувати.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Видалення…' : 'Видалити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
