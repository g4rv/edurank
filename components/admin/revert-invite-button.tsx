'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
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
import { revertInviteSent } from '@/app/(dashboard)/admin/invites/actions';

/**
 * Puts one person back into «не надсилалося», so the next bulk batch reaches
 * them without rewriting everybody else's link.
 *
 * Asks first, because it cannot be undone and it is not only a status: the
 * token IS the link, so any letter that did arrive stops working. The dialog
 * says that rather than leaving it to be discovered.
 */
export function RevertInviteButton({ staffId, fullName }: { staffId: string; fullName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRevert() {
    startTransition(async () => {
      const result = await revertInviteSent(staffId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Позначено як ненадіслане');
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title="Позначити як ненадіслане"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          <span className="sr-only">Позначити як ненадіслане</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Позначити як ненадіслане?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{fullName}</span> знову з’явиться серед
            тих, кому запрошення не надсилалося, і потрапить до наступної розсилки.
            <br />
            <br />
            Посилання з попереднього листа перестане працювати. Робіть це, якщо лист не дійшов.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleRevert} disabled={isPending}>
            {isPending ? 'Скидання...' : 'Позначити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
