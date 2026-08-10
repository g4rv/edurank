'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { StakeTermHint, type StakeTerm } from '@/components/stake/stake-term-hint';
import {
  saveDistribution,
  setStaffLimits,
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
  canOpenStaffProfile,
}: {
  view: StakeDistributionView;
  /** The кафедра's head, its dean, or ADMIN */
  canEdit: boolean;
  /** ADMIN only — turns the Мін/Макс column into two editable fields */
  canEditLimits: boolean;
  /**
   * May this viewer open `/staff/[id]`? ADMIN can; a завідувач is an ordinary
   * `USER` and would be redirected away, so their names link to the
   * Характеристика instead — the page about that person they CAN open.
   */
  canOpenStaffProfile: boolean;
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

  // The caps live here rather than in the cell, because the two bounds are one
  // database row: leaving either field has to write both.
  const [limits, setLimits] = useState<Record<string, { min: string; max: string }>>(() =>
    Object.fromEntries(
      view.rows.map((r) => [
        r.staffId,
        { min: formatStake(r.minHundredths), max: formatStake(r.maxHundredths) },
      ])
    )
  );
  const [limitErrors, setLimitErrors] = useState<Record<string, string>>({});
  const [limitsPending, startLimitsTransition] = useTransition();
  const router = useRouter();

  /**
   * Writes one person's bounds, on leaving either field.
   *
   * Skipped when nothing changed, so tabbing across a row does not fire a save
   * per column. A cap moves what the formula proposes, so a success refreshes
   * the route — and the grid's key remounts it with the recomputed numbers.
   */
  function commitLimits(row: StakeRow) {
    const next = limits[row.staffId];
    if (!next) return;
    const unchanged =
      next.min === formatStake(row.minHundredths) && next.max === formatStake(row.maxHundredths);
    if (unchanged) {
      // Back to what is stored, so there is nothing to write — but a refused
      // value may have left a message on the row, and typing the old number
      // back is exactly how somebody undoes the mistake. Without this the
      // error outlived the thing it was about.
      setLimitErrors((e) => {
        if (!e[row.staffId]) return e;
        const { [row.staffId]: _cleared, ...rest } = e;
        return rest;
      });
      return;
    }

    startLimitsTransition(async () => {
      const form = new FormData();
      form.set('staffId', row.staffId);
      form.set('year', String(view.year));
      form.set('min', next.min);
      form.set('max', next.max);
      const result = await setStaffLimits(null, form);
      if (result && 'error' in result) {
        setLimitErrors((e) => ({ ...e, [row.staffId]: result.error }));
      } else {
        setLimitErrors((e) => {
          const { [row.staffId]: _dropped, ...rest } = e;
          return rest;
        });
        router.refresh();
      }
    });
  }

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

  /**
   * Back to what the formula proposes, and SAVED.
   *
   * Two things this has to do beyond setting the numbers, both of which it
   * missed before:
   *
   * - **Clear the justifications.** Every row now matches the formula, so
   *   there is nothing left to justify — and додаток 2 carrying «asd» against a
   *   row that agrees with the formula is a document contradicting itself.
   * - **Write it.** There is no save button any more; every other edit is
   *   written when a field is left, and this one has no field to leave. A reset
   *   that only changed the screen looked identical to a saved one until the
   *   page was reloaded and the old numbers came back.
   */
  function reset() {
    const values = Object.fromEntries(view.rows.map((r) => [r.staffId, r.formulaHundredths]));
    setValues(values);
    setJustifications(Object.fromEntries(view.rows.map((r) => [r.staffId, ''])));
    setError(null);
    // Saved from the values just computed, not from state — a setState is not
    // visible to the call that follows it.
    save(values, {});
  }

  /**
   * Why an autosave is being held back, or null when it can go ahead.
   *
   * Only two things hold it: no allocation to spread, and spending more than
   * there is. An обґрунтування is NOT one of them — додаток 2 has the column
   * and the head may fill it, but nothing requires them to, so a row that
   * departs from the formula with an empty reason saves like any other.
   */
  const blockedBy: string | null =
    kst === null
      ? 'Кст ще не встановлено — зверніться до адміністратора'
      : overspent
        ? `Перевищено виділені ставки на ${formatStake(-(remaining ?? 0))} — зменште чиюсь ставку`
        : null;

  /**
   * Saves the whole кафедра, on leaving a field.
   *
   * The whole grid and not the one row, because `Кст` bounds the SET: a head
   * moving 0.10 from one person to another would be refused on the first half
   * of the move if rows saved on their own. So a change is kept locally until
   * the grid as a whole is valid, and then written.
   */
  function save(nextValues: Record<string, number>, nextJustifications: Record<string, string>) {
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      const result = await saveDistribution({
        departmentId: view.departmentId,
        year: view.year,
        allocations: view.rows.map((r) => ({
          staffId: r.staffId,
          hundredths: nextValues[r.staffId],
          justification: nextJustifications[r.staffId]?.trim() || null,
        })),
      });
      if (result && 'error' in result) setError(result.error);
      else {
        setSavedAt(Date.now());
        toast.success('Збережено');
      }
    });
  }

  function saveOnBlur() {
    if (!dirty || blockedBy) return;
    save(values, justifications);
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
                  canEditLimits ? 'w-28' : 'w-20 text-right'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  Мін
                  <StakeTermHint term="limits" />
                </span>
              </th>
              <th
                className={cn(
                  'border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground',
                  canEditLimits ? 'w-28' : 'w-20 text-right'
                )}
              >
                Макс
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
                canOpenStaffProfile={canOpenStaffProfile}
                disabled={pending}
                limits={limits[row.staffId] ?? { min: '', max: '' }}
                limitError={limitErrors[row.staffId] ?? null}
                limitsPending={limitsPending}
                onChange={(next) => setValue(row, next)}
                onJustify={(text) => setJustifications((j) => ({ ...j, [row.staffId]: text }))}
                onBlur={saveOnBlur}
                onLimitChange={(bound, next) =>
                  setLimits((l) => ({
                    ...l,
                    [row.staffId]: { ...l[row.staffId], [bound]: next },
                  }))
                }
                onLimitCommit={() => commitLimits(row)}
              />
            ))}
            {view.rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
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
          ? 'Мін і Макс зберігаються окремо від розподілу — після зміни формула перераховується. Бліді значення означають стандартні межі 0,10 / 1,50.'
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
      <Figure
        label="Виділені ставки (Кст)"
        term="kst"
        value={kst === null ? '—' : formatStake(kst)}
      />
      <Figure label="Розподілено" term="distributed" value={formatStake(distributed)} />
      {/* Green whenever the pool holds, red only when it does not. A leftover
          is a normal state — the head has budget still to place — so it reads
          as «fine», not as «unfinished». */}
      <Figure
        label="Нерозподілено"
        term="remaining"
        value={remaining === null ? '—' : formatStake(remaining)}
        tone={overspent ? 'bad' : 'good'}
      />
      <Figure label="Бонус за здобувачів" term="bonus" value={formatBonus(bonusTotal)} muted />
      {/* The sum, not the expression. «12,65 + 0,000» as the headline number is
          arithmetic the reader has to finish themselves; the two parts stay
          visible underneath, which is the thing that must not be lost. */}
      <Figure
        label="Разом до виплати"
        term="total"
        value={formatBonus(distributed / 100 + bonusTotal)}
        note={`${formatStake(distributed)} + ${formatBonus(bonusTotal)}`}
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
  note,
  tone,
  muted,
}: {
  label: string;
  value: string;
  /** Which entry of STAKE_TERMS explains this number */
  term?: StakeTerm;
  /** How the number is made up, under the label */
  note?: string;
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
      {note && <p className="text-xs text-muted-foreground/70 tabular-nums">{note}</p>}
    </div>
  );
}

/**
 * One bound — either the floor or the ceiling — for one person. ADMIN only.
 *
 * Its own column and its own field, saved when the field is left, like every
 * other editable number on this grid. The two bounds are one database row, so
 * leaving either one writes both: whichever the person just edited, plus the
 * other as it currently stands.
 *
 * Kept separate from the distribution's own save because they are different
 * decisions by different people — the caps are the university's standing limits
 * on a person, the distribution is one year's split inside them. Changing a cap
 * also changes what the formula proposes, so a successful write refreshes the
 * route rather than leaving a stale «За формулою» beside a bound that moved.
 */
function LimitCell({
  row,
  bound,
  value,
  editable,
  disabled,
  error,
  onChange,
  onCommit,
}: {
  row: StakeRow;
  bound: 'min' | 'max';
  value: string;
  editable: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (next: string) => void;
  onCommit: () => void;
}) {
  const label = bound === 'min' ? 'Мінімальна' : 'Максимальна';

  if (!editable) {
    // A head sees the bounds they are working inside but cannot move them.
    return (
      <td className="border border-border px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
        {value}
      </td>
    );
  }

  return (
    <td className="border border-border px-3 py-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        disabled={disabled}
        inputMode="decimal"
        aria-label={`${label} ставка для ${row.name}`}
        aria-invalid={!!error}
        className={cn(
          'h-8 w-16 text-right tabular-nums',
          // Dimmed while these are the 0,10 / 1,50 defaults, so «set for this
          // person» still reads differently from «nobody has decided» without
          // a word of text repeated down every row.
          !row.hasOwnLimits && 'text-muted-foreground',
          error && 'border-destructive'
        )}
      />
      {error && <p className="mt-1 max-w-40 text-xs text-destructive">{error}</p>}
    </td>
  );
}

function Row({
  row,
  value,
  justification,
  canEdit,
  canEditLimits,
  canOpenStaffProfile,
  disabled,
  limits,
  limitError,
  limitsPending,
  onChange,
  onJustify,
  onBlur,
  onLimitChange,
  onLimitCommit,
}: {
  row: StakeRow;
  value: number;
  justification: string;
  canEdit: boolean;
  canEditLimits: boolean;
  canOpenStaffProfile: boolean;
  disabled: boolean;
  limits: { min: string; max: string };
  limitError: string | null;
  limitsPending: boolean;
  onChange: (next: number) => void;
  onJustify: (text: string) => void;
  onBlur: () => void;
  onLimitChange: (bound: 'min' | 'max', next: string) => void;
  onLimitCommit: () => void;
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

  const lower = Math.max(row.minHundredths, MIN_STAKE);
  const upper = Math.max(row.maxHundredths, lower);
  const atMin = value <= lower;
  const atMax = value >= upper;
  // A saved allocation can fall outside its bounds without anybody touching it
  // — ADMIN lowers a cap under a number the head already agreed. The save
  // refuses it, so say so on the field instead of only at the moment of saving.
  const outOfRange = value < lower || value > upper;

  return (
    <tr className="transition-colors hover:bg-muted/20">
      <td className="border border-border px-3 py-2 align-middle">
        {/* Opens in a new tab on purpose: this grid holds unsaved work that
            is being HELD BACK — over the pool, or waiting for an
            обґрунтування — and navigating away in place would drop exactly the
            edits the head has not finished explaining yet. */}
        <Link
          href={
            canOpenStaffProfile ? `/staff/${row.staffId}` : `/staff/${row.staffId}/kharakterystyka`
          }
          target="_blank"
          rel="noopener noreferrer"
          title={
            canOpenStaffProfile
              ? 'Відкрити профіль НПП у новій вкладці'
              : 'Відкрити характеристику НПП у новій вкладці'
          }
          className="whitespace-nowrap underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
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

      <LimitCell
        row={row}
        bound="min"
        value={limits.min}
        editable={canEditLimits}
        disabled={disabled || limitsPending}
        error={limitError}
        onChange={(next) => onLimitChange('min', next)}
        onCommit={onLimitCommit}
      />
      <LimitCell
        row={row}
        bound="max"
        value={limits.max}
        editable={canEditLimits}
        disabled={disabled || limitsPending}
        error={limitError}
        onChange={(next) => onLimitChange('max', next)}
        onCommit={onLimitCommit}
      />

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
            aria-invalid={outOfRange}
            title={
              outOfRange ? `Поза межами ${formatStake(lower)} – ${formatStake(upper)}` : undefined
            }
            className={cn(
              'h-8 w-20 text-right tabular-nums',
              differs && 'font-medium',
              outOfRange && 'border-destructive text-destructive'
            )}
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
            placeholder="Чому не за формулою (необов’язково)"
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
