'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { fileUrl } from '@/app/(dashboard)/science-plan/file-actions';

/**
 * «Переглянути» for one attached file — asks `fileUrl` for a signed GET (five
 * minutes, per `lib/science/r2.ts`) and opens it in a new tab.
 *
 * **A toast here is the deliberate exception**, not a slip against the
 * project's own "inline, never a toast" rule: there is no persistent element
 * left on screen to attach a transient "couldn't sign a link right now"
 * failure to once the click that caused it is over, unlike a field the person
 * is still looking at.
 */
export function FileViewButton({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [isPending, startTransition] = useTransition();

  function handleView() {
    startTransition(async () => {
      const result = await fileUrl(fileId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleView}
      disabled={isPending}
      loading={isPending}
      aria-label={`Переглянути ${fileName}`}
    >
      <ExternalLink className="size-3.5" />
      Переглянути
    </Button>
  );
}
