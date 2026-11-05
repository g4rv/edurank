'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import {
  getRunStates,
  startProfileCheck,
  type RunState,
  type RunStates,
} from '@/app/(dashboard)/admin/profile-check/actions';
import { PLATFORM_LABELS } from '@/lib/profile-check/labels';
import { PLATFORMS, type Platform } from '@/lib/profile-check/types';
import { KYIV } from '@/lib/kyiv-time';

const POLL_MS = 2000;

/**
 * One check per platform, each with its own button, status and progress bar
 * (owner, 2026-11-04). They differ too much to share one run — Scholar is
 * spaced to about two seconds a person, ORCID is not — so ORCID can finish
 * while Scholar is still going, and a block by one site holds nothing back.
 *
 * The runs live on the server, so closing the tab stops none of them; this only
 * asks how far each has got, every two seconds while any runs, and refreshes
 * the table when one ends.
 */
export function ProfileCheckRun({
  initial,
  implemented,
  filter,
  counts,
}: {
  initial: RunStates | null;
  /** False for a platform whose rules are not given yet: its button is off */
  implemented: Record<Platform, boolean>;
  /** The page's filters: a run covers exactly the people they show */
  filter: { department?: string; onlyProblems: boolean; q?: string };
  /** Per platform: how many people the filters show; null when unfiltered */
  counts: Record<Platform, number | null>;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunStates | null>(initial);
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({});
  const [pending, startTransition] = useTransition();
  const [starting, setStarting] = useState<Platform | null>(null);

  const anyRunning = PLATFORMS.some((p) => runs?.[p]?.status === 'RUNNING');

  // The runs as last SEEN, for telling which one just ended. A ref, because the
  // check must happen in the poll itself: a state updater runs during render,
  // and refreshing the router from inside one updates another component
  // mid-render (React: «Cannot update a component while rendering a different
  // component»).
  const seen = useRef<RunStates | null>(initial);

  const poll = useCallback(async () => {
    const next = await getRunStates();
    const before = seen.current;
    seen.current = next;
    setRuns(next);
    // A run that just ended: the table has new rows to show
    if (
      before &&
      next &&
      PLATFORMS.some((p) => before[p]?.status === 'RUNNING' && next[p]?.status !== 'RUNNING')
    ) {
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, poll]);

  function start(platform: Platform) {
    setErrors((e) => ({ ...e, [platform]: undefined }));
    setStarting(platform);
    startTransition(async () => {
      try {
        const result = await startProfileCheck(platform, filter);
        if ('error' in result) {
          setErrors((e) => ({ ...e, [platform]: result.error }));
          return;
        }
        await poll();
      } catch {
        setErrors((e) => ({ ...e, [platform]: 'Не вдалося почати перевірку. Спробуйте ще раз' }));
      } finally {
        setStarting(null);
      }
    });
  }

  return (
    <Card className="divide-y divide-border p-0">
      {PLATFORMS.map((platform) => {
        const run = runs?.[platform] ?? null;
        const running = run?.status === 'RUNNING';
        const count = counts[platform];
        const ready = implemented[platform];
        const percent = run && run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;

        return (
          <div key={platform} className="space-y-2 px-5 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="font-medium">{PLATFORM_LABELS[platform]}</div>
                <div className="text-sm">{statusLine(run, ready)}</div>
              </div>
              <Button
                variant="outline"
                onClick={() => start(platform)}
                disabled={!ready || running || (pending && starting === platform) || count === 0}
              >
                {running
                  ? 'Виконується…'
                  : !ready || count === null || count === undefined
                    ? 'Перевірити'
                    : `Перевірити знову: ${count}`}
              </Button>
            </div>

            {running && (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={PLATFORM_LABELS[platform]}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
              </div>
            )}

            {errors[platform] && <p className="text-sm text-error-strong">{errors[platform]}</p>}
          </div>
        );
      })}
    </Card>
  );
}

function statusLine(run: RunState, ready: boolean) {
  if (!ready) {
    return <span className="text-muted-foreground">Правила ще не задані</span>;
  }
  if (run?.status === 'RUNNING') {
    return (
      <span>
        Перевіряємо… {run.done} з {run.total}
      </span>
    );
  }
  if (run?.status === 'DONE' && run.finishedAt) {
    return (
      <span className="text-muted-foreground">
        Завершено {new Date(run.finishedAt).toLocaleString('uk-UA', KYIV)}
      </span>
    );
  }
  if (run?.status === 'FAILED') {
    return (
      <span className="text-error-strong">
        Не завершилась{run.error ? `: ${run.error}` : ''}. Результати — часткові
      </span>
    );
  }
  return <span className="text-muted-foreground">Ще не запускали</span>;
}
