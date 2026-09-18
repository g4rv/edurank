import { ExternalLink, Paperclip, Users } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card, EmptyState } from '@/components/aurora/ui/card';
import { formatHours } from '@/lib/science/hours';
import type { SciencePlanRecordDetail } from '@/lib/queries/get-science-plan';
import { DeleteRecordButton } from '@/components/science/delete-record-button';
import { cn } from '@/lib/utils';

/**
 * The «Виконано» tab — what this person recorded on this кафедра.
 *
 * Mirrors the «План» list in `plan-view.tsx`, and adds the two things a record
 * has that an intention does not: the evidence it is proved by, and the people
 * sharing its pool.
 */
export function RecordList({ records }: { records: SciencePlanRecordDetail[] }) {
  if (records.length === 0) {
    return <EmptyState>Ще немає записів про виконану роботу.</EmptyState>;
  }

  return (
    <Card padding="none">
      <ul className="divide-y">
        {records.map((record) => {
          const declined = record.status === 'REMOVED';
          // Only worth saying when the work is genuinely shared — for a solo
          // work the draw and the pool are the same number.
          const shared = record.coAuthors.length > 0;

          return (
            <li key={record.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className={cn('text-base', declined && 'text-muted-foreground line-through')}>
                    <span className="mr-1.5 text-foreground-soft">{record.itemNumber}</span>
                    {record.workTypeLabel}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground-soft">{record.summary}</p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {record.link && (
                      <a
                        href={record.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand"
                      >
                        <ExternalLink className="size-3.5" />
                        Підтвердження
                      </a>
                    )}
                    {record.fileCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-foreground-soft">
                        <Paperclip className="size-3.5" />
                        {record.fileCount}
                      </span>
                    )}
                    {shared && (
                      <span className="inline-flex items-center gap-1 text-foreground-soft">
                        <Users className="size-3.5" />
                        {/* The only place somebody sees that their 50 год came
                            out of a 200 год pool, and who holds the rest. */}
                        Разом з:{' '}
                        {record.coAuthors
                          .map((a) => `${a.name} — ${formatHours(a.hoursHundredths)} год`)
                          .join(', ')}
                      </span>
                    )}
                  </div>

                  {declined && (
                    <p className="mt-1.5 text-sm text-error-strong">
                      {/* Kept on screen on purpose: a declined record is the one
                          thing the person has to be able to read and answer. */}
                      {record.removedReason ?? 'Запис відхилено.'}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {declined && <Badge tone="destructive">Відхилено</Badge>}
                  <span className="text-sm text-foreground-soft">
                    Годин:{' '}
                    <span
                      className={cn(
                        'text-base font-semibold tabular-nums',
                        declined ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {formatHours(record.hoursHundredths)}
                    </span>
                    {shared && (
                      <span className="text-foreground-soft">
                        {' '}
                        з {formatHours(record.totalHundredths)}
                      </span>
                    )}
                  </span>
                  <DeleteRecordButton recordId={record.id} label={record.summary} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
