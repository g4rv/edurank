'use client';

import { useMemo, useState, useTransition } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  MIN_STAKE,
  STAKE_STEP,
  formatBonus,
  formatStake,
  parseStake,
  snapToStep,
} from '@/lib/stake/units';
import type { StakeDistributionView, StakeRow } from '@/lib/queries/get-stake-distribution';
import { saveDistribution } from '@/app/(dashboard)/departments/[id]/stakes/actions';

/**
 * Додаток 2 — the head spreads the pool by hand, with the formula's own answer
 * beside each row and «нерозподілено» falling as they type.
 *
 * The whole grid saves at once, not row by row. The ceiling is a property of
 * the set: a head moving 0.10 from one person to another would be blocked on
 * the first half of the move if each row saved independently. So the total may
 * go over while they work — it turns red — and the SAVE is what refuses.
 *
 * Ліміти are shown to everyone and editable by nobody here. A head who could
 * raise their own cap and drop a colleague's would make the caps meaningless,
 * which is the reason they are ADMIN-only (decided 2026-08-05).
 */
export function DistributionGrid({
  view,
  canEdit,
  canEditLimits,
}: {
  view: StakeDistributionView;
  /** The кафедра's head, its dean, or ADMIN */
  canEdit: boolean;
  /** ADMIN only — the caps column becomes editable elsewhere */
  canEditLimits: boolean;
}) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(view.rows.map((r) => [r.staffId, r.proposedHundredths]))
  );
  const [justifications, setJustifications] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.rows.map((r) => [r.staffId, r.justification ?? '']))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kst = view.kstHundredths;

  const distributed = useMemo(() => Object.values(values).reduce((sum, v) => sum + v, 0), [values]);
  const remaining = kst === null ? null : kst - distributed;
  const overspent = remaining !== null && remaining < 0;
  const bonusTotal = view.rows.reduce((sum, r) => sum + r.bonus, 0);

  const dirty = view.rows.some(
    (r) =>
      values[r.staffId] !== r.proposedHundredths ||
      (justifications[r.staffId] ?? '') !== (r.justification ?? '')
  );

  function setValue(row: StakeRow, next: number) {
    // The caps are absolute — clamped here as well as on the server, so the
    // ▲▼ buttons simply stop rather than producing a value the save rejects.
    const lower = Math.max(row.minHundredths, MIN_STAKE);
    const upper = Math.max(row.maxHundredths, lower);
    setValues((v) => ({ ...v, [row.staffId]: Math.min(Math.max(next, lower), upper) }));
    setError(null);
  }

  function reset() {
    setValues(Object.fromEntries(view.rows.map((r) => [r.staffId, r.formulaHundredths])));
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveDistribution({
        departmentId: view.departmentId,
        year: view.year,
        allocations: view.rows.map((r) => ({
          staffId: r.staffId,
          hundredths: values[r.staffId],
          justification: justifications[r.staffId]?.trim() || null,
        })),
      });
      if (result && 'error' in result) setError(result.error);
      else toast.success('Розподіл збережено');
    });
  }

  return (
    <div className="space-y-4">
      <Totals
        kst={kst}
        distributed={distributed}
        remaining={remaining}
        overspent={overspent}
        bonusTotal={bonusTotal}
        formulaTotal={view.formulaTotalHundredths}
      />

      {!view.computable && (
        <p className="rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          {view.knpp === 0
            ? 'Кнпп = 0 — на кафедрі немає НПП із 4+ позиціями ліцензійних умов, тому формула не рахується. Усі отримують мінімальну ставку, доки це не зміниться.'
            : 'Ні в кого немає рейтингових балів за цей рік, тому формула не рахується.'}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                НПП
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Рейтинг
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                За формулою
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Мін / Макс
              </th>
              <th className="w-52 border border-border px-3 py-2 font-medium text-muted-foreground">
                Розподілено
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Бонус
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Разом
              </th>
              <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                Обґрунтування
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <Row
                key={row.staffId}
                row={row}
                value={values[row.staffId]}
                justification={justifications[row.staffId] ?? ''}
                canEdit={canEdit}
                disabled={pending}
                onChange={(next) => setValue(row, next)}
                onJustify={(text) => setJustifications((j) => ({ ...j, [row.staffId]: text }))}
              />
            ))}
            {view.rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="border border-border px-3 py-10 text-center text-muted-foreground"
                >
                  На кафедрі немає НПП
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {canEdit && view.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty || kst === null}>
            {pending ? 'Збереження…' : 'Зберегти розподіл'}
          </Button>
          <Button variant="outline" onClick={reset} disabled={pending}>
            <RotateCcw className="size-4" />
            Повернути до формули
          </Button>
          {kst === null && (
            <span className="text-xs text-muted-foreground">
              Кст ще не встановлено — зверніться до адміністратора
            </span>
          )}
          {view.filledAt && (
            <span className="ml-auto text-xs text-muted-foreground">
              Заповнив: {view.filledBy ?? '—'}, {view.filledAt.toLocaleDateString('uk-UA')}
            </span>
          )}
        </div>
      )}

      {!canEditLimits && (
        <p className="text-xs text-muted-foreground">
          Мінімальну і максимальну ставку встановлює адміністратор.
        </p>
      )}
    </div>
  );
}

/**
 * The three totals, separately — «разом» can exceed `Кст` and be correct.
 *
 * `Кст` bounds the pool share and nothing else. If the head saw one merged
 * number above their pool they would read it as an overspend every time
 * somebody on the кафедра had recruited a student.
 */
function Totals({
  kst,
  distributed,
  remaining,
  overspent,
  bonusTotal,
  formulaTotal,
}: {
  kst: number | null;
  distributed: number;
  remaining: number | null;
  overspent: boolean;
  bonusTotal: number;
  formulaTotal: number;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-4">
      <Figure label="Кст (пул)" value={kst === null ? '—' : formatStake(kst)} />
      <Figure label="Розподілено" value={formatStake(distributed)} />
      <Figure
        label="Нерозподілено"
        value={remaining === null ? '—' : formatStake(remaining)}
        tone={overspent ? 'bad' : remaining === 0 ? 'good' : undefined}
      />
      <Figure label="Бонус за здобувачів" value={formatBonus(bonusTotal)} muted />
      <Figure
        label="Разом"
        value={`${formatStake(distributed)} + ${formatBonus(bonusTotal)}`}
        muted
      />
      <span className="ml-auto text-xs text-muted-foreground">
        Сума за формулою: {formatStake(formulaTotal)}
      </span>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  muted?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums',
          muted && 'text-base font-medium text-muted-foreground',
          tone === 'bad' && 'text-destructive',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-400'
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({
  row,
  value,
  justification,
  canEdit,
  disabled,
  onChange,
  onJustify,
}: {
  row: StakeRow;
  value: number;
  justification: string;
  canEdit: boolean;
  disabled: boolean;
  onChange: (next: number) => void;
  onJustify: (text: string) => void;
}) {
  // What the person types, kept separately so the field is not fighting them
  // mid-keystroke. It is snapped to the ladder on blur, per the sketch.
  const [draft, setDraft] = useState<string | null>(null);
  const differs = value !== row.formulaHundredths;

  function commit() {
    if (draft === null) return;
    const parsed = parseStake(draft);
    // Unparseable input falls back to the current value rather than to zero:
    // a stray keystroke must never quietly pay somebody nothing.
    onChange(parsed === null ? value : snapToStep(parsed));
    setDraft(null);
  }

  const atMin = value <= Math.max(row.minHundredths, MIN_STAKE);
  const atMax = value >= row.maxHundredths;

  return (
    <tr className="transition-colors hover:bg-muted/20">
      <td className="border border-border px-3 py-2">
        {row.name}
        {!row.qualifies && (
          <span
            className="ml-2 text-xs text-muted-foreground"
            title={`${row.positions} із 20 позицій ліцензійних умов — не входить до Кнпп, але ставку отримує`}
          >
            {row.positions}/20
          </span>
        )}
      </td>

      <td className="border border-border px-3 py-2 text-right text-muted-foreground tabular-nums">
        {row.rating}
      </td>

      <td className="border border-border px-3 py-2 text-right tabular-nums">
        {formatStake(row.formulaHundredths)}
        {row.clampedTo && (
          <span
            className="ml-1 text-xs text-muted-foreground"
            title={
              row.clampedTo === 'max'
                ? 'Обмежено максимальною ставкою'
                : 'Підняте до мінімальної ставки'
            }
          >
            {row.clampedTo === 'max' ? '↓' : '↑'}
          </span>
        )}
      </td>

      {/* Read-only for everyone on this screen — ADMIN edits caps on /admin/stakes */}
      <td className="border border-border px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {formatStake(row.minHundredths)} / {formatStake(row.maxHundredths)}
        {!row.hasOwnLimits && (
          <span className="ml-1" title="Стандартні межі — окремих не встановлено">
            *
          </span>
        )}
      </td>

      <td className="border border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            value={draft ?? formatStake(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            disabled={!canEdit || disabled}
            inputMode="decimal"
            aria-label={`Ставка для ${row.name}`}
            className={cn('h-8 w-20 text-right tabular-nums', differs && 'font-medium')}
          />
          <div className="flex flex-col">
            <button
              type="button"
              aria-label="Збільшити на 0,05"
              disabled={!canEdit || disabled || atMax}
              onClick={() => onChange(value + STAKE_STEP)}
              className="rounded px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Зменшити на 0,05"
              disabled={!canEdit || disabled || atMin}
              onClick={() => onChange(value - STAKE_STEP)}
              className="rounded px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        </div>
      </td>

      <td className="border border-border px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
        {row.bonus === 0 ? '—' : formatBonus(row.bonus)}
      </td>

      <td className="border border-border px-3 py-2 text-right font-medium tabular-nums">
        {formatBonus(value / 100 + row.bonus)}
      </td>

      <td className="border border-border px-3 py-2">
        {/* Додаток 2's «Обґрунтування» — asked for only when the head departs
            from the formula, because a justification for agreeing with it is
            noise the reader has to skip. */}
        {differs ? (
          <Input
            value={justification}
            onChange={(e) => onJustify(e.target.value)}
            disabled={!canEdit || disabled}
            placeholder="Чому не за формулою"
            aria-label={`Обґрунтування для ${row.name}`}
            className="h-8"
          />
        ) : (
          <span className="text-xs text-muted-foreground">за формулою</span>
        )}
      </td>
    </tr>
  );
}
