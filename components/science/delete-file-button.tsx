'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X } from 'lucide-react';
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
import { deleteFile } from '@/app/(dashboard)/science-plan/file-actions';

/**
 * Remove one attached file. `deleteFile` existed from the start and nothing
 * called it, so a wrong file — the wrong сертифікат, a blurred scan — was
 * permanent.
 *
 * A confirm rather than a plain button: the object goes from R2 with the row,
 * and its SHA-256 is what stops the same bytes being used twice, so this is
 * not recoverable by re-uploading a copy from somewhere else.
 */
export function DeleteFileButton({ fileId, fileName }: { fileId: string; fileName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteFile(fileId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Файл видалено');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={isPending}
          aria-label={`Видалити ${fileName}`}
          className="text-muted-foreground hover:bg-error/10 hover:text-error-strong"
        >
          <X className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити файл?</AlertDialogTitle>
          <AlertDialogDescription>
            {fileName} буде видалено назавжди. Якщо це єдине підтвердження запису, додайте замість
            нього посилання або інший файл.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Видалити</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
