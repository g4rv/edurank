import { Fragment } from 'react';
import { ExternalLink, FileText, Users } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card, EmptyState } from '@/components/aurora/ui/card';
import { formatHours } from '@/lib/science/hours';
import type { DeferredShareDetail, SciencePlanRecordDetail } from '@/lib/queries/get-science-plan';
import { ShareYearButton } from '@/components/science/share-year-button';
import { DeleteRecordButton } from '@/components/science/delete-record-button';
import { DeleteFileButton } from '@/components/science/delete-file-button';
import { ReplaceFileDialog } from '@/components/science/replace-file-dialog';
import { FileViewButton } from '@/components/science/file-view-button';
import { AttachFileDialog } from '@/components/science/attach-file-dialog';
import { EditRecordDialog } from '@/components/science/edit-record-dialog';
import { EditCoauthorsDialog } from '@/components/science/edit-coauthors-dialog';
import type { CoauthorCandidate } from '@/lib/queries/list-coauthor-candidates';
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
  deferred = [],
  workTypes,
  academicYear,
  lastExecutionMonth,
  coauthorCandidates,
}: {
  records: SciencePlanRecordDetail[];
  /** This person's shares of this year's works moved to the next year. */
  deferred?: DeferredShareDetail[];
  /** The year's catalogue, for the «Редагувати» form to rebuild the work's own
   *  fields from. Keyed by id below. */
  workTypes: PlanWorkType[];
  /** D48 — the навчальний рік, for the «Редагувати» form's month picker. */
  academicYear: string;
  lastExecutionMonth: number;
  /** Everybody the author may name in «Співавтори». */
  coauthorCandidates: CoauthorCandidate[];
}) {
  const workTypeById = new Map(workTypes.map((t) => [t.id, t]));

  if (records.length === 0 && deferred.length === 0) {
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
                              .map(
                                (a) =>
                                  `${a.name} — ${formatHours(a.hoursHundredths)} год${
                                    a.deferredTo
                                      ? ` (перенесено на ${a.deferredTo})`
                                      : a.pending
                                        ? ' (чекає на план)'
                                        : ''
                                  }`
                              )
                              .join(', ')}
                          </span>
                        )}
                        {/* Told to the people who cannot change it: with two
                            people able to move the same pool «who has how much»
                            would have no answer, so the author does (owner,
                            2026-09-30). */}
                        {shared && !record.canEdit && (
                          <span className="text-foreground-soft">
                            Змінити частку — зверніться до автора ({record.authorName})
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
                      wrong number is an edit, a late file is an attachment, and
                      the split of a shared work is «Співавтори» — all the
                      author's, and nobody else's (owner, 2026-09-30). */}
                      {/* Also while the WORK is declined: fixing the proof is
                          exactly what a declined work is waiting for. A record
                          ННВ declined on its own, before a decline became the
                          work's, still cannot be edited. */}
                      {(!declined || record.workDeclined) && record.canEdit && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {record.canEdit &&
                            !record.workDeclined &&
                            workTypeById.has(record.workTypeId) && (
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
                          {/* On every SHARED work — also one nobody shares yet: how a
                              co-author is added later, since nobody can add
                              themselves. An INDIVIDUAL work has no pool. */}
                          {record.sharing === 'SHARED' && (
                            <EditCoauthorsDialog
                              // Remounts when the saved split changes, so the
                              // form never opens on a list that is already gone.
                              key={record.coAuthors
                                .map((a) => `${a.staffId}:${a.hoursHundredths}`)
                                .join('|')}
                              workId={record.workId}
                              label={record.summary}
                              totalHundredths={record.totalHundredths}
                              myHundredths={record.hoursHundredths}
                              coauthors={record.coAuthors}
                              candidates={coauthorCandidates}
                            />
                          )}
                          {/* D47: not for a вид роботи proved by a link alone. */}
                          {record.canEdit &&
                            workTypeById.get(record.workTypeId)?.fileRule !== 'NONE' && (
                              <AttachFileDialog workId={record.workId} label={record.summary} />
                            )}
                        </div>
                      )}

                      {/* A co-author picks the year their share counts in
                          (owner, 2026-10-02). Never on the author's row. */}
                      {record.deferrable && (
                        <div className="mt-2">
                          <ShareYearButton
                            mode="defer"
                            workId={record.workId}
                            label={record.summary}
                            hoursHundredths={record.hoursHundredths}
                            targetYear={record.deferrable}
                            currentYear={academicYear}
                          />
                        </div>
                      )}

                      {declined && (
                        <p className="mt-1.5 text-sm text-error-strong">
                          {/* Kept on screen on purpose: a declined record is the one
                          thing the person has to be able to read and answer. */}
                          {record.removedReason ?? 'Запис відхилено.'}
                        </p>
                      )}
                      {/* A decline is of the WORK, so it stops every co-author's
                          hours until the author fixes the proof (owner,
                          2026-09-30). The author is told what to do and given the
                          button; a co-author is told whom to ask. */}
                      {declined && record.workDeclined && (
                        <div className="mt-1.5 space-y-2 text-sm text-foreground-soft">
                          {record.canEdit ? (
                            <>
                              <p>
                                Години не зараховуються ні вам, ні співавторам, доки роботу не
                                виправлено. Якщо причина — файл чи співавтори, змініть їх кнопками
                                вище, а потім виправте дані й надішліть роботу на повторну
                                перевірку.
                              </p>
                              {workTypeById.has(record.workTypeId) && (
                                <EditRecordDialog
                                  resubmit
                                  declineReason={record.removedReason}
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
                            </>
                          ) : (
                            <p>
                              Години не зараховуються, доки автор ({record.authorName}) не виправить
                              підтвердження й не надішле роботу повторно.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {declined && <Badge tone="destructive">Відхилено</Badge>}
                      {record.resubmitted && <Badge tone="warn">Виправлено</Badge>}
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
                      {/* Only the author deletes, and it takes the whole work
                          (owner, 2026-10-02) — a co-author has no bin. */}
                      {record.canEdit && (
                        <DeleteRecordButton
                          recordId={record.id}
                          label={record.summary}
                          coauthorCount={record.coAuthors.length}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </Fragment>
        ))}

        {/* Shares moved to the next year — listed, never counted here. */}
        {deferred.length > 0 && (
          <>
            <li className="flex items-baseline justify-between gap-3 bg-table-group px-5 py-2 text-sm font-semibold">
              <span>Перенесено на {deferred[0].academicYear}</span>
              <span className="font-normal text-foreground-soft">у цьому році не рахуються</span>
            </li>
            {deferred.map((share) => (
              <li key={share.workId} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-foreground-soft">{share.workTypeLabel}</p>
                    <p className="mt-0.5 text-sm text-foreground-soft">{share.summary}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      {share.link && (
                        <a
                          href={share.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand"
                        >
                          <ExternalLink className="size-3.5" />
                          Підтвердження
                        </a>
                      )}
                      <span className="text-foreground-soft">Автор: {share.authorName}</span>
                    </div>
                    <div className="mt-2">
                      <ShareYearButton
                        mode="back"
                        workId={share.workId}
                        label={share.summary}
                        hoursHundredths={share.hoursHundredths}
                        targetYear={academicYear}
                        currentYear={academicYear}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-foreground-soft">
                    Годин:{' '}
                    <span className="text-base font-semibold text-foreground-soft tabular-nums">
                      {formatHours(share.hoursHundredths)}
                    </span>{' '}
                    з {formatHours(share.totalHundredths)} · у {share.academicYear}
                  </span>
                </div>
              </li>
            ))}
          </>
        )}
      </ul>
    </Card>
  );
}
