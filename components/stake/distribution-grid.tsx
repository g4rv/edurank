'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
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
import { StakeTermHint, type StakeTerm } from '@/components/stake/stake-term-hint';
import {
  saveDistribution,
  setStaffLimits,
  type DistributionState,
} from '@/app/(dashboard)/departments/[id]/stakes/actions';

/**
 * Додаток 2 — the head spreads the pool by hand, with the formula's own answer
 * beside each row and «нерозподілено» falling as they type.
 *
 * A change is written when the field is left — there is no save button. But it
 * writes the WHOLE grid, never the one row, because `Кст` bounds the set: a
 * head moving 0.10 from one person to another would be refused on the first
 * half of the move if rows saved on their own.
 *
 * So a blur does not always write. While the grid as a whole is invalid — over
 * the pool, or a departure from the formula with no обґрунтування yet — the
 * change is kept locally and the footer says it is being held and why. That is
 * the difference between «autosave» and «autosave that silently drops work».
 *
 * Ліміти are shown to everyone and editable only by ADMIN, on these same rows.
 * A head who could raise their own cap and drop a colleague's would make the
 * caps meaningless, which is why they are ADMIN-only (decided 2026-08-05) —
 * and why the head still SEES them: bounds you cannot see are bounds you file
 * a bug about when a button stops moving.
 */
export function DistributionGrid({
  view,
  canEdit,
  canEditLimits,
}: {
  view: StakeDistributionView;
  /** The кафедра's head, its dean, or ADMIN */
  canEdit: boolean;
  /** ADMIN only — turns the Мін/Макс column into two editable fields */
  canEditLimits: boolean;
}) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(view.rows.map((r) => [r.staffId, r.proposedHundredths]))
  );
  const [justifications, setJustifications] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.rows.map((r) => [r.staffId, r.justification ?? '']))
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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

  /**
   * Rows that departed from the formula and have not been explained yet.
   *
   * Checked before saving rather than after: the server refuses these, and
   * auto-saving on every blur would mean the head sees «вкажіть обґрунтування»
   * the instant they change a number, before they have had any chance to type
   * one. The red field already says which row is waiting.
   */
  const unexplained = view.rows.filter(
    (r) => values[r.staffId] !== r.formulaHundredths && !justifications[r.staffId]?.trim()
  );

  /** Why an autosave is being held back, or null when it can go ahead */
  const blockedBy: string | null =
    kst === null
      ? 'Кст ще не встановлено — зверніться до адміністратора'
      : overspent
        ? `Перевищення пулу на ${formatStake(-(remaining ?? 0))} — зменште чиюсь ставку`
        : unexplained.length > 0
          ? 'Вкажіть обґрунтування там, де ставка відрізняється від формули'
          : null;

  /**
   * Saves the whole кафедра, on leaving a field.
   *
   * The whole grid and not the one row, because `Кст` bounds the SET: a head
   * moving 0.10 from one person to another would be refused on the first half
   * of the move if rows saved on their own. So a change is kept locally until
   * the grid as a whole is valid, and then written.
   */
  function saveOnBlur() {
    if (!canEdit || !dirty || blockedBy) return;
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
      else {
        setSavedAt(Date.now());
        toast.success('Збережено');
      }
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
              {/* НПП and Обґрунтування carry text and take what is left; every
                  other column is a number or a control of known size.
                  `whitespace-nowrap` on the headings is the point: a heading
                  that wraps sets the height of the whole row, and the widths
                  below are chosen to hold each label on one line. */}
              <th className="min-w-44 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                НПП
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                Рейтинг
              </th>
              <th className="w-32 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  За формулою
                  <StakeTermHint term="formula" />
                </span>
              </th>
              <th
                className={cn(
                  'border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground',
                  canEditLimits ? 'w-40' : 'w-24 text-right'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  Мін / Макс
                  <StakeTermHint term="limits" />
                </span>
              </th>
              <th className="w-40 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Розподілено
              </th>
              <th className="w-20 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                Бонус
              </th>
              <th className="w-20 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                Разом
              </th>
              <th className="min-w-48 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Обґрунтування
                  <StakeTermHint term="justification" />
                </span>
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
                canEditLimits={canEditLimits}
                year={view.year}
                disabled={pending}
                onChange={(next) => setValue(row, next)}
                onJustify={(text) => setJustifications((j) => ({ ...j, [row.staffId]: text }))}
                onBlur={saveOnBlur}
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
          <Button variant="outline" onClick={reset} disabled={pending}>
            <RotateCcw className="size-4" />
            Повернути до формули
          </Button>

          {/* There is no save button: a change is written when the field is
              left. What this line does is say what state that leaves things
              in, because a silent autosave is indistinguishable from a lost
              edit — especially while a change is being HELD BACK, which is the
              one case where leaving a field does not write anything. */}
          <span className="text-xs">
            {pending ? (
              <span className="text-muted-foreground">Збереження…</span>
            ) : blockedBy && dirty ? (
              <span className="text-destructive">Не збережено: {blockedBy}</span>
            ) : dirty ? (
              <span className="text-muted-foreground">Незбережені зміни</span>
            ) : savedAt ? (
              <span className="text-emerald-700 dark:text-emerald-400">Збережено</span>
            ) : null}
          </span>

          {view.filledAt && (
            <span className="ml-auto text-xs text-muted-foreground">
              Заповнив: {view.filledBy ?? '—'}, {view.filledAt.toLocaleDateString('uk-UA')}
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {canEditLimits
          ? 'Межі зберігаються окремо від розподілу — після зміни формула перераховується. «Стандартні» означає 0,10 / 1,50.'
          : 'Мінімальну і максимальну ставку встановлює адміністратор.'}
      </p>
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
      <Figure label="Пул кафедри (Кст)" term="kst" value={kst === null ? '—' : formatStake(kst)} />
      <Figure label="Розподілено" term="distributed" value={formatStake(distributed)} />
      {/* Green whenever the pool holds, red only when it does not. A leftover
          is a normal state — the head has budget still to place — so it reads
          as «fine», not as «unfinished». */}
      <Figure
        label="Залишок пулу"
        term="remaining"
        value={remaining === null ? '—' : formatStake(remaining)}
        tone={overspent ? 'bad' : 'good'}
      />
      <Figure label="Бонус за здобувачів" term="bonus" value={formatBonus(bonusTotal)} muted />
      <Figure
        label="Разом до виплати"
        term="total"
        value={`${formatStake(distributed)} + ${formatBonus(bonusTotal)}`}
        muted
      />
      <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
        Формула пропонує: {formatStake(formulaTotal)}
        <StakeTermHint term="formula" />
      </span>
    </div>
  );
}

function Figure({
  label,
  value,
  term,
  tone,
  muted,
}: {
  label: string;
  value: string;
  /** Which entry of STAKE_TERMS explains this number */
  term?: StakeTerm;
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
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {term && <StakeTermHint term={term} />}
      </p>
    </div>
  );
}

/**
 * One person's floor and ceiling — ADMIN only.
 *
 * Its own form, saved on its own, unlike the distribution below it. The two are
 * different decisions by different people: the caps are the university's
 * standing limits on a person, the distribution is one year's split inside
 * them. Changing a cap also changes what the formula proposes, so this reloads
 * the route rather than leaving a stale «За формулою» beside a new bound.
 */
function LimitsCell({ row, year, disabled }: { row: StakeRow; year: number; disabled: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DistributionState, FormData>(
    setStaffLimits,
    null
  );

  useEffect(() => {
    if (state && 'success' in state) router.refresh();
  }, [state, router]);

  const error = state && 'error' in state ? state.error : null;

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="staffId" value={row.staffId} />
      <input type="hidden" name="year" value={year} />
      <div className="flex items-center gap-1">
        <Input
          name="min"
          defaultValue={formatStake(row.minHundredths)}
          disabled={disabled || pending}
          inputMode="decimal"
          aria-label={`Мінімальна ставка для ${row.name}`}
          className={cn(
            'h-8 w-14 text-right tabular-nums',
            // Dimmed while these are the 0,10 / 1,50 defaults, so «set for this
            // person» still reads differently from «nobody has decided» without
            // a word of text repeated down every row.
            !row.hasOwnLimits && 'text-muted-foreground'
          )}
        />
        <span className="text-xs text-muted-foreground">/</span>
        <Input
          name="max"
          defaultValue={formatStake(row.maxHundredths)}
          disabled={disabled || pending}
          inputMode="decimal"
          aria-label={`Максимальна ставка для ${row.name}`}
          className={cn(
            'h-8 w-14 text-right tabular-nums',
            !row.hasOwnLimits && 'text-muted-foreground'
          )}
        />
        <button
          type="submit"
          disabled={disabled || pending}
          title="Зберегти межі"
          aria-label={`Зберегти межі для ${row.name}`}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <Check className="size-3.5" />
        </button>
      </div>
      {/* No «стандартні» label: it repeated down sixteen of eighteen rows and
          added a line to each. The dimmed fields say the same thing quietly,
          and the footnote under the table gives the two numbers. */}
      {error && <p className="max-w-52 text-xs text-destructive">{error}</p>}
    </form>
  );
}

function Row({
  row,
  value,
  justification,
  canEdit,
  canEditLimits,
  year,
  disabled,
  onChange,
  onJustify,
  onBlur,
}: {
  row: StakeRow;
  value: number;
  justification: string;
  canEdit: boolean;
  canEditLimits: boolean;
  year: number;
  disabled: boolean;
  onChange: (next: number) => void;
  onJustify: (text: string) => void;
  onBlur: () => void;
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
      <td className="border border-border px-3 py-2 align-middle">
        <span className="whitespace-nowrap">{row.name}</span>
        {/* «позицій із 20» on every row, not only the ones falling short: the
            head is looking at who counts towards Кнпп, and a badge that appears
            only on failures makes its absence the message, which is easy to
            read as «not measured». Green clears the licence bar, red does not.

            Red here does NOT mean this person is paid less. Кнпп is a divisor
            in the formula and nothing else — everybody on the кафедра receives
            a ставка, which the title says in full. */}
        <span
          className={cn(
            'ml-2 text-xs font-medium tabular-nums',
            row.qualifies ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
          )}
          title={
            row.qualifies
              ? `${row.positions} із 20 позицій ліцензійних умов — входить до Кнпп`
              : `${row.positions} із 20 позицій ліцензійних умов — не входить до Кнпп, але ставку отримує`
          }
        >
          {row.positions}/20
        </span>
      </td>

      <td
        className="border border-border px-3 py-2 text-right text-muted-foreground tabular-nums"
        title={`${row.rating} балів`}
      >
        {Math.round(row.rating)}
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

      <td className="border border-border px-3 py-2">
        {canEditLimits ? (
          <LimitsCell row={row} year={year} disabled={disabled} />
        ) : (
          // A head sees the bounds they are working inside but cannot move
          // them — the whole point of the caps being ADMIN-only.
          <p className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {formatStake(row.minHundredths)} / {formatStake(row.maxHundredths)}
            {!row.hasOwnLimits && (
              <span className="ml-1" title="Стандартні межі — окремих не встановлено">
                *
              </span>
            )}
          </p>
        )}
      </td>

      <td className="border border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            value={draft ?? formatStake(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              commit();
              onBlur();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
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
            onBlur={onBlur}
            disabled={!canEdit || disabled}
            placeholder="Чому не за формулою"
            aria-label={`Обґрунтування для ${row.name}`}
            // Required, not optional: it is додаток 2's own column and the
            // reason a departure from the formula is allowed at all.
            aria-invalid={justification.trim() === ''}
            className={cn('h-8', justification.trim() === '' && 'border-destructive')}
          />
        ) : (
          <span className="text-xs text-muted-foreground">за формулою</span>
        )}
      </td>
    </tr>
  );
}
