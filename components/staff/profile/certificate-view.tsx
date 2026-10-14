import { ExternalLink, FileText } from 'lucide-react';
import { CertificateFileButton } from '@/components/staff/profile/certificate-file-button';
import { MaybeField, Fields } from '@/components/staff/profile/primitives';
import { certificateFacts } from '@/lib/language-certificates/facts';
import { CERTIFICATE_KINDS, CERTIFICATE_TITLES } from '@/lib/language-certificates/options';
import type { PersonCertificates } from '@/lib/queries/get-language-certificates';
import { formatFileSize } from '@/lib/qualifications/format';

/**
 * The two language certificates, as they read in the «Освіта» card (owner,
 * 2026-10-14): one small card each, headed by its name, then the facts in a line,
 * then the scan. A certificate nobody entered is a «—» row like every other blank
 * (aurora.md §5) — it is a thing a reader expects to find or not.
 *
 * **Decides no permission** (aurora.md §12): `canOpenFiles` arrives from the route.
 * The text of a certificate is read like the rest of «Освіта»; only the SCAN is
 * narrower — the owner, ADMIN and a division with the qualifications switch.
 */

export function CertificateView({
  staffId,
  certificates,
  canOpenFiles,
  showEmpty,
}: {
  staffId: string;
  certificates: PersonCertificates;
  canOpenFiles: boolean;
  showEmpty: boolean;
}) {
  const kinds = CERTIFICATE_KINDS.filter((kind) => certificates[kind] || showEmpty);
  if (kinds.length === 0) return null;

  return (
    <div className="space-y-3">
      {kinds.map((kind) => {
        const record = certificates[kind];
        if (!record) {
          return (
            <Fields key={kind}>
              <MaybeField label={CERTIFICATE_TITLES[kind]} value={null} showEmpty />
            </Fields>
          );
        }
        return (
          <div key={kind} className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="font-medium">{CERTIFICATE_TITLES[kind]}</p>
            <p className="mt-0.5 text-sm text-foreground-soft">
              {certificateFacts(kind, record).join(' · ')}
            </p>
            {record.url && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                <ExternalLink className="size-3.5 shrink-0 text-foreground-soft" aria-hidden />
                <a
                  href={record.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-brand hover:underline"
                >
                  {record.url}
                </a>
              </p>
            )}
            {record.file && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-sm text-foreground-soft">
                  <FileText className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{record.file.name}</span>
                  <span className="shrink-0 tabular-nums">
                    · {formatFileSize(record.file.sizeBytes)}
                  </span>
                </p>
                {canOpenFiles && (
                  <CertificateFileButton
                    staffId={staffId}
                    kind={kind}
                    fileName={record.file.name}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
