'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import {
  getRunState,
  startProfileCheck,
  type RunState,
} from '@/app/(dashboard)/admin/profile-check/actions';
import { KYIV } from '@/lib/kyiv-time';

const POLL_MS = 2000;

/**
 * The run button and its progress. The run lives on the server, so closing the
 * tab does not stop it; this only asks how far it has got, every two seconds
 * while it runs, and refreshes the table when it ends.
 */
export function ProfileCheckRun({ initial }: { initial: RunState }) {
  const router = useRouter();
  const [run, setRun] = useState<RunState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const running = run?.status === 'RUNNING';

  const poll = useCallback(async () => {
    const next = await getRunState();
    setRun(next);
    if (next && next.status !== 'RUNNING') router.refresh();
  }, [router]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, poll]);

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await startProfileCheck();
        if ('error' in result) {
          setError(result.error);
          return;
        }
        await poll();
      } catch {
        setError('Не вдалося почати перевірку. Спробуйте ще раз');
      }
    });
  }

  const percent = run && run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {running && run ? (
            <span>
              Перевіряємо… {run.done} з {run.total}
            </span>
          ) : run?.status === 'DONE' && run.finishedAt ? (
            <span className="text-muted-foreground">
              Остання перевірка завершена {new Date(run.finishedAt).toLocaleString('uk-UA', KYIV)}
            </span>
          ) : run?.status === 'FAILED' ? (
            <span className="text-error-strong">
              Остання перевірка не завершилась{run.error ? `: ${run.error}` : ''}. Результати —
              часткові
            </span>
          ) : (
            <span className="text-muted-foreground">Перевірку ще не запускали</span>
          )}
        </div>
        <Button onClick={start} disabled={pending || running}>
          {running ? 'Виконується…' : 'Перевірити профілі'}
        </Button>
      </div>

      {running && (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      {error && <p className="text-sm text-error-strong">{error}</p>}
    </Card>
  );
}
