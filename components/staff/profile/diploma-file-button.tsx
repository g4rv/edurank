'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { diplomaFileUrl } from '@/app/(dashboard)/diplomas/file-actions';

/**
 * «Переглянути» for a diploma's scan (owner, 2026-10-27) — `CertificateFileButton`'s
 * twin: a signed GET opened in a new tab, drawn only where the page knows the
 * viewer may read scans, and checked again by the action. A failure is a toast
 * for the reason that button gives.
 */
export function DiplomaFileButton({
  diplomaId,
  fileName,
}: {
  diplomaId: string;
  fileName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function view() {
    startTransition(async () => {
      const result = await diplomaFileUrl(diplomaId);
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
