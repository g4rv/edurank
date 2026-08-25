'use client';

import { ExternalLink } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { normaliseOrcid, orcidUrl } from '@/lib/orcid';

/**
 * The ORCID row on a profile — one `<dt>/<dd>` pair, the same shape as the
 * local `Field` on both pages that use it.
 *
 * The identifier is the link text rather than «Профіль», which is what the
 * three citation links say: an ORCID is quoted in papers and in reports, so the
 * number itself has to be readable and copyable, not hidden behind a word. The
 * copy button therefore copies the bare identifier and never the address.
 *
 * A value that is not an ORCID renders as plain text, exactly as it is stored —
 * see `lib/orcid.ts` for why nothing is guessed.
 */
export function OrcidField({ value }: { value: string | null }) {
  const id = normaliseOrcid(value);
  const href = orcidUrl(value);

  return (
    <div>
      <dt className="text-xs text-muted-foreground">ORCID</dt>
      <dd className="mt-0.5 flex items-center gap-1 text-sm">
        {id !== null && href !== null ? (
          <>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {id}
              <ExternalLink className="size-3 shrink-0" />
            </a>
            {/* `-my-1` so a 24px button does not make this row taller than the
                three above it inside the same `space-y-3` list. */}
            <CopyButton value={id} what="ORCID" className="-my-1 size-6" />
          </>
        ) : (
          <span>{value?.trim() || '—'}</span>
        )}
      </dd>
    </div>
  );
}
