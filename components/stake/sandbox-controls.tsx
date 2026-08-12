'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatStake, parseStake } from '@/lib/stake/units';
import { resetSandbox, setSandboxKst } from '@/app/(dashboard)/stakes/actions';
import { cn } from '@/lib/utils';

/**
 * The sandbox's own bar: the pool being tried, and the way out of it.
 *
 * `Кст` sits here rather than in the grid because it is the кафедра's number,
 * not a person's — and because in the sandbox it is the first thing ADMIN
 * changes. Typing a pool here never touches `DepartmentStake`; the real one is
 * still shown beside it, so the two can never be confused.
 */
export function SandboxControls({
  departmentId,
  year,
  kstHundredths,
  realKstHundredths,
  saved,
  updatedAt,
}: {
  departmentId: string;
  year: number;
  /** What the sandbox is using — the tried pool, or the real one */
  kstHundredths: number | null;
  /** The кафедра's actual `Кст`, for the «повернути» hint */
  realKstHundredths: number | null;
  /** Has anything been saved into this sandbox at all? */
  saved: boolean;
  updatedAt: Date | null;
}) {
  const [draft, setDraft] = useState(kstHundredths === null ? '' : formatStake(kstHundredths));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function commit() {
    const trimmed = draft.trim();
    // Empty means «use the кафедра's real Кст» — a way back that does not need
    // ADMIN to remember what the real number was.
    const next = trimmed === '' ? null : parseStake(trimmed);
    if (trimmed !== '' && next === null) {
      setError('Вкажіть число, напр. 6,00');
      return;
    }
    if (next === kstHundredths) return;

    setError(null);
    startTransition(async () => {
      const result = await setSandboxKst({ departmentId, year, kstHundredths: next });
      if (result && 'error' in result) setError(result.error);
      else router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await resetSandbox({ departmentId, year });
      if (result && 'error' in result) {
        setError(result.error);
      } else {
        setDraft('');
        toast.success('Пісочницю очищено');
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border-2 border-dashed bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="size-4 text-muted-foreground" />
          Пісочниця
        </span>

        <label className="inline-flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Кст для розрахунку</span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={pending}
            inputMode="decimal"
            aria-label="Кст для пісочниці"
            aria-invalid={!!error}
            placeholder={realKstHundredths === null ? 'не задано' : formatStake(realKstHundredths)}
            className={cn(
              'h-8 w-24 text-right tabular-nums placeholder:text-muted-foreground/60',
              error && 'border-destructive'
            )}
          />
        </label>

        <span className="text-xs text-muted-foreground">
          Справжній Кст:{' '}
          <strong className="tabular-nums">
            {realKstHundredths === null ? '—' : formatStake(realKstHundredths)}
          </strong>
          . Порожнє поле повертає його.
        </span>

        {saved && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={pending}
            className="ml-auto text-muted-foreground"
          >
            <RotateCcw className="size-4" />
            Скинути пісочницю
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
        Нічого з цієї вкладки не потрапляє до НПП: ставки, Мін і Макс тут існують лише для вас і
        зберігаються, щоб не вводити їх щоразу заново. Розподіл зберігає завідувач кафедри — на
        вкладці «Реальний» ви бачите те саме, що бачить він.
        {updatedAt && ` Востаннє змінено ${updatedAt.toLocaleDateString('uk-UA')}.`}
      </p>
    </div>
  );
}
