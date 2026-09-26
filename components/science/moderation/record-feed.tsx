import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { EmptyState } from '@/components/aurora/ui/card';
import { Pagination } from '@/components/aurora/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { formatHours } from '@/lib/science/hours';
import { monthLabel, monthRangeLabel, SHOW_EXECUTION_PERIOD } from '@/lib/science/execution-month';
import type { ScienceRecordFeedRow } from '@/lib/queries/list-science-records';
import { FileViewButton } from '@/components/science/file-view-button';
import { DiscardRecordButton } from '@/components/science/moderation/discard-record-button';
import { RestoreRecordButton } from '@/components/science/moderation/restore-record-button';
import { cn } from '@/lib/utils';

const COLUMNS = [null, '11rem', 'calc(7ch + 2rem)', '10rem', '8rem', '9rem'];

/**
 * ННВ's / ADMIN's post-check feed for наукова робота (D20) — every
 * `ScienceRecord` university-wide, newest first, no year or кафедра scope
 * (see `lib/queries/list-science-records.ts`). Follows `ModerationList`'s own
 * discard-with-reason shape for the rating; drawn with «Аврора»'s table
 * rather than the older `DataTable`, since this screen is new.
 *
 * **No `'use client'` here.** The table itself needs no state — sorting and
 * filtering are not asked for by the spec, and paging is a real navigation
 * (`hrefFor`, computed by the caller from the page's own searchParams), the
 * same split `record-list.tsx` already draws between a plain list and the
 * client buttons (`DiscardRecordButton`, `RestoreRecordButton`) it embeds.
 */
export function RecordFeed({
  rows,
  page,
  totalPages,
  hrefFor,
}: {
  rows: readonly ScienceRecordFeedRow[];
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (rows.length === 0) {
    return <EmptyState>Записів про виконану наукову роботу ще немає.</EmptyState>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Table
        columns={COLUMNS}
        head={
          <TableRow>
            <TableHead>ПІБ / Вид роботи</TableHead>
            <TableHead>Кафедра</TableHead>
            <TableHead numeric>Години</TableHead>
            <TableHead>Файли</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead />
          </TableRow>
        }
      >
        <TableBody>
          {rows.map((row) => {
            const declined = row.status === 'REMOVED';
            const shared = row.totalHundredths !== row.hoursHundredths;

            return (
              <TableRow key={row.id}>
                <TableCell>
                  <p
                    className={cn('font-medium', declined && 'text-muted-foreground line-through')}
                  >
                    {row.staffName}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground-soft">
                    <span className="mr-1.5 text-muted-foreground tabular-nums">
                      {row.itemNumber}
                    </span>
                    {row.workTypeLabel}
                  </p>
                  {/* The month only while it is shown (hidden 2026-09-24). */}
                  {SHOW_EXECUTION_PERIOD ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.summary && `${row.summary} · `}
                      {row.startedMonth
                        ? monthRangeLabel(row.startedMonth, row.executedMonth)
                        : monthLabel(row.executedMonth)}
                    </p>
                  ) : (
                    row.summary && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.summary}</p>
                    )
                  )}
                  {declined && (
                    <p className="mt-1 text-xs text-error-strong">
                      {row.removedReason ?? 'Запис відхилено.'}
                    </p>
                  )}
                </TableCell>

                <TableCell muted>{row.departmentName}</TableCell>

                <TableCell numeric>
                  <span className={cn(declined && 'text-muted-foreground line-through')}>
                    {formatHours(row.hoursHundredths)}
                  </span>
                  {shared && (
                    <span className="text-foreground-soft">
                      {' '}
                      з {formatHours(row.totalHundredths)}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.link && (
                      <a
                        href={row.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
                      >
                        <ExternalLink className="size-3.5" />
                        Посилання
                      </a>
                    )}
                    {/* OPENABLE, not a count. A post-check where the reviewer
                        can see a paperclip but not the certificate behind it
                        is not a check — and `fileUrl` has always entitled ННВ
                        and ADMIN to a signed GET. */}
                    {row.files.map((file) => (
                      <span key={file.id} className="inline-flex items-center gap-1">
                        <FileViewButton fileId={file.id} fileName={file.fileName} />
                        {/* Item 4 pays 50 год per page, so the page count is
                            the number worth putting in front of a reviewer. */}
                        {file.pageCount !== null && (
                          <span className="text-foreground-soft">{file.pageCount} стор.</span>
                        )}
                      </span>
                    ))}
                    {/* D28 — this work's file(s) may be standing in for more
                        than this one record, so a decline here is not only
                        about this person's own claim. */}
                    {row.sharedFiles && <Badge tone="warn">Спільний файл</Badge>}
                  </div>
                </TableCell>

                <TableCell>
                  {declined ? (
                    <Badge tone="destructive">Відхилено</Badge>
                  ) : (
                    <Badge tone="ok">Зараховано</Badge>
                  )}
                </TableCell>

                <TableCell align="right">
                  {declined ? (
                    <RestoreRecordButton recordId={row.id} />
                  ) : (
                    <DiscardRecordButton
                      recordId={row.id}
                      label={row.workTypeLabel}
                      staffName={row.staffName}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={hrefFor}
        summary={
          <>
            Стор. {page} з {totalPages}
          </>
        }
      />
    </div>
  );
}
