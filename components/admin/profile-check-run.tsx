'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import {
  getRunStates,
  startProfileCheck,
  type RunMode,
  type RunState,
  type RunStates,
} from '@/app/(dashboard)/admin/profile-check/actions';
import { cooldownSecondsLeft } from '@/lib/profile-check/cooldown';
import { PLATFORM_LABELS } from '@/lib/profile-check/labels';
import { plural } from '@/lib/profile-check/tally';
import { PLATFORMS, type Platform } from '@/lib/profile-check/types';
import { KYIV } from '@/lib/kyiv-time';

const POLL_MS = 2000;

/** Said in the popup of a site that refuses a long run — why «ще не перевіряли» exists */
const HINTS: Partial<Record<Platform, string>> = {
  orcid:
    'ORCID дозволяє без реєстрації до 12 запитів на секунду і 25 000 на добу з однієї адреси. Перевірка однієї людини — 3 запити.',
  scopus: 'Ключ Elsevier дає 5 000 запитів на тиждень. Перевірка однієї людини — 1 запит.',
  googleScholar:
    'Google Scholar швидко обмежує зайві запити, тому перевірка повільна (близько 8 с на людину). Якщо його заблоковано, почніть із тих, кого ще не перевіряли, і поверніться пізніше за рештою.',
  wos: 'Web of Science обмежує частоту запитів, тому перевірка повільна (близько 10 с на людину). Краще перевіряти лише тих, кого ще не перевіряли.',
};

const people = (n: number) => `${n} ${plural(n, 'особа', 'особи', 'осіб')}`;

/**
 * One check per platform, each with its own button, status and progress bar
 * (owner, 2026-11-04). They differ too much to share one run — Scholar is
 * spaced to several seconds a person, ORCID is not — so ORCID can finish while
 * Scholar is still going, and a block by one site holds nothing back.
 *
 * **A button opens a choice** (owner, 2026-11-05): ask only those who have no
 * answer yet, ask everyone, or cancel. A site that refuses a long run part-way
 * can then be finished later without asking the first ones again. With a filter
 * on, both mean the people shown.
 *
 * The runs live on the server, so closing the tab stops none of them; this only
 * asks how far each has got, every two seconds while any runs, and refreshes
 * the table when one ends.
 */
export function ProfileCheckRun({
  initial,
  implemented,
  filter,
  filtered,
  counts,
}: {
  initial: RunStates | null;
  /** False for a platform whose rules are not given yet: its button is off */
  implemented: Record<Platform, boolean>;
  /** The page's filters: a run covers exactly the people they show */
  filter: { department?: string; onlyProblems: boolean; q?: string };
  /** Whether any filter is on, for the popup's wording */
  filtered: boolean;
  /** Per platform: people in scope with a link there, and those with no answer yet */
  counts: Record<Platform, { all: number; missing: number }>;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunStates | null>(initial);
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({});
  const [choosing, setChoosing] = useState<Platform | null>(null);
  const [pending, startTransition] = useTransition();
  const [starting, setStarting] = useState<Platform | null>(null);

  const anyRunning = PLATFORMS.some((p) => runs?.[p]?.status === 'RUNNING');

  // A minute between two runs of one platform: the server refuses an earlier one,
  // this only counts it down so the button says why it is off. `now` is refreshed
  // whenever the runs are, or a run that has just ended would read a stale clock.
  const [now, setNow] = useState(() => Date.now());
  const waiting = PLATFORMS.some((p) => cooldownSecondsLeft(runs?.[p]?.finishedAt, now) > 0);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

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
    setNow(Date.now());
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

  function start(platform: Platform, mode: RunMode) {
    setChoosing(null);
    setErrors((e) => ({ ...e, [platform]: undefined }));
    setStarting(platform);
    startTransition(async () => {
      try {
        const result = await startProfileCheck(platform, filter, mode);
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

  const choice = choosing ? counts[choosing] : null;

  return (
    <>
      <Card className="divide-y divide-border p-0">
        {PLATFORMS.map((platform) => {
          const run = runs?.[platform] ?? null;
          const running = run?.status === 'RUNNING';
          const ready = implemented[platform];
          const percent = run && run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;
          const cooling = cooldownSecondsLeft(run?.finishedAt, now);

          return (
            <div key={platform} className="space-y-2 px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="font-medium">{PLATFORM_LABELS[platform]}</div>
                  <div className="text-sm">{statusLine(run, ready)}</div>
                  {run && <UsageLine run={run} />}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setChoosing(platform)}
                  disabled={
                    !ready ||
                    running ||
                    cooling > 0 ||
                    (pending && starting === platform) ||
                    counts[platform].all === 0
                  }
                >
                  {running ? 'Виконується…' : cooling > 0 ? `Зачекайте ${cooling} с` : 'Перевірити'}
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
                  <div
                    className="h-full bg-brand transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}

              {errors[platform] && <p className="text-sm text-error-strong">{errors[platform]}</p>}
            </div>
          );
        })}
      </Card>

      <Dialog open={choosing !== null} onOpenChange={(open) => !open && setChoosing(null)}>
        <DialogContent className="max-w-md">
          {choosing && choice && (
            <>
              <DialogHeader>
                <DialogTitle>Перевірка: {PLATFORM_LABELS[choosing]}</DialogTitle>
                <DialogDescription>
                  {filtered
                    ? `За поточним фільтром: ${people(choice.all)}`
                    : `Усього ${people(choice.all)} з профілем на цій платформі`}
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => start(choosing, 'missing')}
                    disabled={choice.missing === 0}
                  >
                    Перевірити тих, кого ще не перевіряли ({choice.missing})
                  </Button>
                  {choice.missing === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Усіх уже перевірено — для кожного є результат.
                    </p>
                  )}
                  <Button variant="outline" onClick={() => start(choosing, 'all')}>
                    Перевірити всіх ({choice.all})
                  </Button>
                  <Button variant="ghost" onClick={() => setChoosing(null)}>
                    Скасувати
                  </Button>
                </div>
                {HINTS[choosing] && (
                  <p className="mt-4 text-xs text-muted-foreground">{HINTS[choosing]}</p>
                )}
              </DialogBody>
              <DialogFooter className="hidden" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
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
        {run.failed > 0 && (
          <span className="text-warning">
            {' '}
            · не вдалося перевірити: {run.failed} — попередні дані збережено
          </span>
        )}
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

/**
 * What the platform has used (owner, 2026-11-05): the requests of the last seven
 * days, and — where the site says so, as Elsevier does — what is left of its own
 * quota and when that resets. Google and Web of Science publish no limit, so
 * their count is the only way to learn where they cut us off; Web of Science's
 * counts page loads only, so it is a floor.
 */
function UsageLine({ run }: { run: NonNullable<RunState> }) {
  const n = (v: number) => v.toLocaleString('uk-UA');
  return (
    <div className="text-xs text-muted-foreground">
      Запитів за 7 днів: {n(run.requestsWeek)}
      {run.quota && (
        <>
          {' · '}
          квота ключа: залишилось {n(run.quota.remaining)} з {n(run.quota.limit)}, оновиться{' '}
          {new Date(run.quota.resetAt).toLocaleString('uk-UA', {
            ...KYIV,
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </>
      )}
    </div>
  );
}
