'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Eye } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DiscardActivityButton } from '@/components/rating/discard-activity-button';
import { VerifyActivityButton } from '@/components/rating/verify-activity-button';
import { getSubmissionDetail, type SubmissionDetail } from '@/app/(dashboard)/moderation/actions';
import type { ModerationRow } from '@/components/rating/moderation-list';

/**
 * One submission, in full, beside the list it came from.
 *
 * The table can only ever show a summary — five fields joined and truncated to
 * a line — which is fine for finding a record and useless for judging one. This
 * is where a moderator actually does the job: every field kept apart, nothing
 * cut, and a DOI or a link they can open in a new tab.
 *
 * Two sources on purpose. The evidence comes from `getSubmissionDetail` and
 * never changes, so it is fetched once per record. The status, the score and
 * what may be done to it come from the ROW, which the parent re-renders after
 * every action — so confirming or discarding updates this panel without it
 * having to re-fetch or know that anything happened.
 */
export function SubmissionPanel({
  row,
  open,
  onOpenChange,
}: {
  row: ModerationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // What was loaded, and WHICH record it belongs to. Keeping the id with the
  // payload is what makes «this is somebody else's evidence» impossible: moving
  // to the next record changes `id`, the two stop matching, and the panel shows
  // its loading state again without anything having to clear it.
  const [loaded, setLoaded] = useState<{
    id: string;
    detail?: SubmissionDetail;
    error?: string;
  } | null>(null);

  const id = row?.id ?? null;
  const current = loaded?.id === id ? loaded : null;
  const detail = current?.detail;
  const error = current?.error;

  useEffect(() => {
    if (!open || !id) return;
    let active = true;
    getSubmissionDetail(id).then((result) => {
      // The reader can move on before this resolves; a late answer must not
      // paint itself over the record they are looking at now.
      if (!active) return;
      setLoaded('error' in result ? { id, error: result.error } : { id, detail: result.detail });
    });
    return () => {
      active = false;
    };
  }, [open, id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto p-0">
        {row && (
          <>
            <SheetHeader className="border-b pb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">п. {row.itemNumber}</span>
                <span>·</span>
                <span>Розділ {row.section}</span>
              </div>
              <SheetTitle>{row.label}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  <Link
                    href={`/staff/${detail?.staffId ?? ''}`}
                    className={cn(
                      'font-medium text-foreground hover:underline',
                      !detail && 'pointer-events-none'
                    )}
                  >
                    {row.staffName}
                  </Link>
                  {row.department && <> · {row.department}</>}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 px-6 py-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <Figure label="Бали">
                  <span
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      row.status === 'REMOVED' && 'text-muted-foreground line-through'
                    )}
                  >
                    {row.score}
                  </span>
                </Figure>
                <Figure label="Статус">{row.statusLabel}</Figure>
                <Figure label="Подано">{row.date}</Figure>
                {row.verified && (
                  <Figure label="Перевірено">
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <Eye className="size-3.5" />
                      так
                    </span>
                  </Figure>
                )}
              </div>

              {row.status === 'REMOVED' && row.removeReason && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  Відхилено: {row.removeReason}
                </p>
              )}

              <div>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Підтвердження
                </h3>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : !detail ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : detail.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Цей показник не потребує підтвердження.
                  </p>
                ) : (
                  <dl className="divide-y rounded-lg border">
                    {detail.items.map((item) => (
                      <div
                        key={item.name}
                        className={cn(
                          'px-3 py-2.5 text-sm',
                          item.multiline ? 'space-y-1' : 'flex items-baseline gap-3'
                        )}
                      >
                        <dt
                          className={cn(
                            'text-muted-foreground',
                            !item.multiline && 'w-40 shrink-0'
                          )}
                        >
                          {item.label}
                        </dt>
                        <dd className="min-w-0 flex-1 break-words">
                          {item.href ? (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1 text-primary underline underline-offset-2 hover:opacity-80"
                            >
                              <span className="break-all">{item.value}</span>
                              <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
                            </a>
                          ) : (
                            item.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>

            <SheetFooter>
              <div className="flex items-center gap-2">
                {row.canVerify && (
                  <VerifyActivityButton activityId={row.id} verified={row.verified} />
                )}
                {row.canDiscard && (
                  <DiscardActivityButton
                    activityId={row.id}
                    label={row.label}
                    staffName={row.staffName}
                  />
                )}
                {!row.canVerify && !row.canDiscard && (
                  <span className="text-xs text-muted-foreground">
                    Рік закрито — редагування недоступне.
                  </span>
                )}
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
