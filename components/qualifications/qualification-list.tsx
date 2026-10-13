import { FileText } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card, EmptyState } from '@/components/aurora/ui/card';
import { DeleteQualificationButton } from '@/components/qualifications/delete-qualification-button';
import { QualificationDialog } from '@/components/qualifications/qualification-dialog';
import { QualificationFileButton } from '@/components/qualifications/qualification-file-button';
import {
  creditsLabel,
  documentNumber,
  formatFileSize,
  formatIssuedOn,
  hoursFromCredits,
  hoursLabel,
} from '@/lib/qualifications/format';
import { DOCUMENT_TYPE_LABELS, QUALIFICATION_KIND_LABELS } from '@/lib/qualifications/options';
import type { QualificationRow } from '@/lib/queries/list-qualifications';

/**
 * The records of one person, newest document first.
 *
 * **Handed `canWrite`, never works it out** (aurora.md §12): a component has no
 * session. The НПП and ADMIN get edit and delete; a division that only reads
 * gets the file link and nothing else. The actions check the right again.
 */
export function QualificationList({
  staffId,
  rows,
  canWrite,
}: {
  staffId: string;
  rows: QualificationRow[];
  canWrite: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState>
        {canWrite
          ? 'Записів ще немає. Натисніть «Додати запис», щоб внести перший.'
          : 'Записів про підвищення кваліфікації чи стажування немає.'}
      </EmptyState>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={row.kind === 'TRAINING' ? 'brand' : 'muted'}>
                  {QUALIFICATION_KIND_LABELS[row.kind]}
                </Badge>
                <span className="text-sm text-foreground-soft tabular-nums">
                  {formatIssuedOn(row.issuedOn)}
                </span>
              </div>

              <p className="text-base font-medium">{row.topic}</p>
              <p className="text-sm text-foreground-soft">{row.institution}</p>
              <p className="text-sm text-foreground-soft">
                {DOCUMENT_TYPE_LABELS[row.documentType]} {documentNumber(row.series, row.number)}
                {' · '}
                {creditsLabel(row.creditsHundredths)}
                {' · '}
                {hoursLabel(hoursFromCredits(row.creditsHundredths))}
              </p>

              {row.file && (
                <p className="flex items-center gap-1.5 text-sm text-foreground-soft">
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{row.file.name}</span>
                  <span className="shrink-0 tabular-nums">
                    · {formatFileSize(row.file.sizeBytes)}
                  </span>
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {row.file && (
                <QualificationFileButton qualificationId={row.id} fileName={row.file.name} />
              )}
              {canWrite && (
                <>
                  <QualificationDialog staffId={staffId} qualification={row} />
                  <DeleteQualificationButton
                    qualificationId={row.id}
                    label={row.topic}
                    hasFile={!!row.file}
                  />
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
