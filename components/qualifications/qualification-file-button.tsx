'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { qualificationFileUrl } from '@/app/(dashboard)/qualifications/file-actions';

/**
 * «Переглянути» for a record's scan — asks for a signed GET (five minutes) and
 * opens it in a new tab. A toast on failure is the deliberate exception to
 * «inline, never a toast»: the click that caused it is over, and nothing is left
 * on screen to attach the message to (the same call `FileViewButton` makes).
 */
export function QualificationFileButton({
  qualificationId,
  fileName,
}: {
  qualificationId: string;
  fileName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function view() {
    startTransition(async () => {
      const result = await qualificationFileUrl(qualificationId);
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
      onClick={view}
      disabled={isPending}
      loading={isPending}
      aria-label={`Переглянути ${fileName}`}
    >
      <ExternalLink className="size-3.5" />
      Переглянути
    </Button>
  );
}
