'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { restoreScienceRecord } from '@/app/(dashboard)/moderation/science-actions';

/**
 * Undo a decline — a plain button, not a confirm dialog: putting a record
 * back to APPROVED is the reversible direction, unlike discarding it.
 */
export function RestoreRecordButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreScienceRecord(recordId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис відновлено');
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRestore}
      disabled={isPending}
      loading={isPending}
    >
      <RotateCcw className="size-3.5" />
      Відновити
    </Button>
  );
}
