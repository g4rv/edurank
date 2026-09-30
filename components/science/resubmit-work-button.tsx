'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { resubmitScienceWork } from '@/app/(dashboard)/science-plan/record-actions';
import { attempt } from '@/lib/science/attempt';

/**
 * «Надіслати на повторну перевірку» — the author's answer to a declined work
 * (owner, 2026-09-30).
 *
 * ННВ declined it because its proof was wrong. The author puts the link or the
 * file right («Редагувати», «Замінити») and presses this: every co-author's hours
 * count again at once, and ННВ sees the work marked «Виправлено» to look at it a
 * second time. Nothing waits for an approval — the app has none for science.
 *
 * Only shown to the author; the server refuses anybody else, and refuses while
 * the proof is still missing, in which case its sentence is shown here.
 */
export function ResubmitWorkButton({ workId }: { workId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleResubmit() {
    startTransition(async () => {
      const result = await attempt(() => resubmitScienceWork(workId));
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Роботу надіслано на повторну перевірку');
      router.refresh();
    });
  }

  return (
    <Button size="sm" onClick={handleResubmit} loading={isPending} disabled={isPending}>
      <Send className="size-4" />
      Надіслати на повторну перевірку
    </Button>
  );
}
