'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { languageCertificateFileUrl } from '@/app/(dashboard)/language-certificates/file-actions';
import type { CertificateKind } from '@/lib/language-certificates/options';

/**
 * «Переглянути» for a language certificate's scan — asks for a signed GET (five
 * minutes) and opens it in a new tab. The server decides who may: this button is
 * only drawn where the page already knows the viewer may read the scan, and the
 * action checks again.
 *
 * A toast on failure is the deliberate exception to «inline, never a toast»: the
 * click that caused it is over, and nothing is left on screen to attach it to
 * (the call `FileViewButton` and `QualificationFileButton` make).
 */
export function CertificateFileButton({
  staffId,
  kind,
  fileName,
}: {
  staffId: string;
  kind: CertificateKind;
  fileName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function view() {
    startTransition(async () => {
      const result = await languageCertificateFileUrl(staffId, kind);
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
