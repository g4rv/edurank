'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
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
} from '@/components/ui/alert-dialog';
import type { PendingInvite } from '@/lib/queries/list-pending-invites';
import { revertInviteSentMany } from '@/app/(dashboard)/admin/invites/actions';

/**
 * «Позначити як ненадіслані» for everyone the filters currently select.
 *
 * Only the people with a date. Somebody already reading «не надсилалося» has no
 * token, so including them in the count would promise something the action
 * would then skip — and the number beside a button is what an admin decides on.
 *
 * The list this receives is already narrowed by кафедра, kind and domain,
 * because those are URL params the page reads before it queries. So picking a
 * кафедра and pressing this resets that кафедра and nothing else.
 */
export function BulkRevertInvite({ people }: { people: PendingInvite[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const invited = people.filter((p) => p.invitedAt);
  if (invited.length === 0) return null;

  function run() {
    startTransition(async () => {
      const result = await revertInviteSentMany(invited.map((p) => p.id));
      setConfirming(false);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Позначено як ненадіслані: ${result.count}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setConfirming(true)}
        loading={isPending}
        disabled={isPending}
      >
        {!isPending && <RotateCcw className="size-4" />}
        Позначити як ненадіслані ({invited.length})
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Позначити {invited.length} як ненадіслані?</AlertDialogTitle>
            <AlertDialogDescription>
              Ці люди знову з’являться серед тих, кому запрошення не надсилалося, і потраплять до
              наступної розсилки.
              <br />
              <br />
              Посилання з попередніх листів перестануть працювати. Робіть це для тих, кому лист не
              дійшов.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={run} disabled={isPending}>
              {isPending ? 'Скидання...' : 'Позначити'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
