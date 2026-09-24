import { Fragment } from 'react';
import { ExternalLink, FileText, Users } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card, EmptyState } from '@/components/aurora/ui/card';
import { formatHours } from '@/lib/science/hours';
import type { SciencePlanRecordDetail } from '@/lib/queries/get-science-plan';
import { DeleteRecordButton } from '@/components/science/delete-record-button';
import { DeleteFileButton } from '@/components/science/delete-file-button';
import { ReplaceFileDialog } from '@/components/science/replace-file-dialog';
import { FileViewButton } from '@/components/science/file-view-button';
import { AttachFileDialog } from '@/components/science/attach-file-dialog';
import { EditRecordDialog } from '@/components/science/edit-record-dialog';
import { EditHoursDialog } from '@/components/science/edit-hours-dialog';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { cn } from '@/lib/utils';
import { groupByMonth } from '@/lib/science/group-by-month';
import { groupByItem } from '@/lib/science/group-by-item';
import { monthLabel, monthRangeLabel, SHOW_EXECUTION_PERIOD } from '@/lib/science/execution-month';

/**
 * «204,8 КБ» — there is no byte-formatter elsewhere in the codebase to share;
 * exact rounding does not matter here, only a reasonable read. `sizeBytes` is
 * always a positive integer (`fileProblem` refuses an empty file before it is
 * ever stored), so the KB/MB boundary is the only branch worth having.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

/**
 * The «Виконано» tab — what this person recorded on this кафедра.
 *
 * Mirrors the «План» list in `plan-view.tsx`, and adds the two things a record
 * has that an intention does not: the evidence it is proved by, and the people
 * sharing its pool.
 */
export function RecordList({
  records,
  workTypes,
  academicYear,
  lastExecutionMonth,
}: {
  records: SciencePlanRecordDetail[];
  /** The year's catalogue, for the «Редагувати» form to rebuild the work's own
   *  fields from. Keyed by id below. */
  workTypes: PlanWorkType[];
  /** D48 — the навчальний рік, for the «Редагувати» form's month picker. */
  academicYear: string;
  lastExecutionMonth: number;
}) {
  const workTypeById = new Map(workTypes.map((t) => [t.id, t]));

  if (records.length === 0) {
    return <EmptyState>Ще немає записів про виконану роботу.</EmptyState>;
  }

  const sections = SHOW_EXECUTION_PERIOD
    ? groupByMonth(records).map((g) => ({
        key: g.month,
        heading: monthLabel(g.month),
        rows: g.rows,
      }))
    : groupByItem(records).map((g) => {
        // The пункт's own heading, as «План» draws it.
        const first = workTypeById.get(g.rows[0].workTypeId);
        return {
          key: g.itemNumber,
          heading: `Пункт ${g.itemNumber} · ${first?.itemTitle || g.rows[0].workTypeLabel}`,
          rows: g.rows,
        };
      });

  return (
    // `overflow-hidden`: the grey пункт row is square, and without the clip it
    // painted over the card's rounded top corners — the shared `Table` clips
    // itself the same way.
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y">
        {/* One heading per пункт, like «План» — or, while the execution month
            is shown, one per month, newest first (D41). Either way the same
            device as a table's `variant="group"` row (aurora.md: a value
            repeated down many rows is a heading, not a column). The hours
            beside it count only what still counts, like every other sum here. */}
        {sections.map((group) => (
          <Fragment key={group.key}>
            <li className="flex items-baseline justify-between gap-3 bg-table-group px-5 py-2 text-sm font-semibold">
              <span>{group.heading}</span>
              <span className="font-normal text-foreground-soft tabular-nums">
                {formatHours(
                  group.rows
                    .filter((r) => r.status === 'APPROVED')
                    .reduce((sum, r) => sum + r.hoursHundredths, 0)
                )}{' '}
                год
              </span>
            </li>
            {group.rows.map((record) => {
              const declined = record.status === 'REMOVED';
              // Only worth saying when the work is genuinely shared — for a solo
              // work the draw and the pool are the same number.
              const shared = record.coAuthors.length > 0;

              return (
                <li key={record.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-base',
                          declined && 'text-muted-foreground line-through'
                        )}
                      >
                        {/* Under a пункт heading the number would repeat it. */}
                        {SHOW_EXECUTION_PERIOD && (
                          <span className="mr-1.5 text-foreground-soft">{record.itemNumber}</span>
                        )}
                        {record.workTypeLabel}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground-soft">{record.summary}</p>
                      {SHOW_EXECUTION_PERIOD && record.startedMonth && (
                        <p className="mt-0.5 text-sm text-foreground-soft">
                          {/* Grouped under the month it ended; this is how
                              long it took. The hours are not split. */}
                          Тривала: {monthRangeLabel(record.startedMonth, record.executedMonth)}
                        </p>
                      )}

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

                      {record.files.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {record.files.map((file) => (
                            <li
                              key={file.id}
                              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-soft"
                            >
                              <FileText className="size-3.5 shrink-0" />
                              <span className="min-w-0 truncate" title={file.fileName}>
                                {file.fileName}
                              </span>
                              <span>· {formatFileSize(file.sizeBytes)}</span>
                              {/* Item 4 prices per page — the number a reviewer
                              compares — so a PDF's page count is worth showing,
                              never just its byte size. */}
                              {file.pageCount !== null && <span>· {file.pageCount} стор.</span>}
                              <FileViewButton fileId={file.id} fileName={file.fileName} />
                              {/* D46: whoever entered the work or uploaded this
                                  file. «Видалити» stays shown on the only proof —
                                  its refusal names «Замінити» as the way out. */}
                              {file.canChange && (
                                <>
                                  <ReplaceFileDialog fileId={file.id} fileName={file.fileName} />
                                  <DeleteFileButton fileId={file.id} fileName={file.fileName} />
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* The ways to put a mistake right without delete-and-retype,
                      which dead-ended on the work that survived the delete: a
                      wrong number is an edit, a late file is an attachment —
                      both the author's — and the share of a shared work is
                      every co-author's own (D46). */}
                      {!declined && (record.canEdit || shared) && (
                        <div className="mt-1 -ml-2 flex flex-wrap items-center gap-1">
                          {record.canEdit && workTypeById.has(record.workTypeId) && (
                            <EditRecordDialog
                              workId={record.workId}
                              type={workTypeById.get(record.workTypeId)!}
                              evidence={record.evidence}
                              link={record.link}
                              executedMonth={record.executedMonth}
                              startedMonth={record.startedMonth}
                              academicYear={academicYear}
                              lastExecutionMonth={lastExecutionMonth}
                              label={record.summary}
                            />
                          )}
                          {/* Only where there is somebody to share with (owner,
                              2026-09-24): a sole author's share is the whole
                              pool, so the button offered a choice of one. */}
                          {shared && (
                            <EditHoursDialog
                              recordId={record.id}
                              hoursHundredths={record.hoursHundredths}
                              totalHundredths={record.totalHundredths}
                              othersHundredths={record.coAuthors.reduce(
                                (sum, a) => sum + a.hoursHundredths,
                                0
                              )}
                              label={record.summary}
                            />
                          )}
                          {/* D47: not for a вид роботи proved by a link alone. */}
                          {record.canEdit &&
                            workTypeById.get(record.workTypeId)?.fileRule !== 'NONE' && (
                              <AttachFileDialog workId={record.workId} label={record.summary} />
                            )}
                        </div>
                      )}

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
          </Fragment>
        ))}
      </ul>
    </Card>
  );
}
