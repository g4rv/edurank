'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
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
  roundBonus,
  snapToStep,
} from '@/lib/stake/units';
import { payableStake } from '@/lib/stake/total';
import type { StakeDistributionView, StakeRow } from '@/lib/queries/get-stake-distribution';
import { StakeTermHint, type StakeTerm } from '@/components/stake/stake-term-hint';
import { StakeStepper } from '@/components/stake/stake-stepper';
import { BonusCell } from '@/components/stake/bonus-cell';
import { saveDistribution, saveSandbox, setStaffLimits } from '@/app/(dashboard)/stakes/actions';

/** The two bounds of one row, as typed */
type LimitDraft = { min: string; max: string };

/**
 * Додаток 2 — the head spreads the pool by hand, with the formula's own answer
 * beside each row and «нерозподілено» falling as they type.
 *
 * A change is written when the field is left — there is no save button. But it
 * writes the WHOLE grid, never the one row, because `Кст` bounds the set: a
 * head moving 0.10 from one person to another would be refused on the first
 * half of the move if rows saved on their own.
 *
 * The same grid renders ADMIN's sandbox (`view.sandbox`). What changes is where
 * a blur lands — `StakeSandbox` instead of `StakeAllocation` — and that the
 * «only upwards» rule is lifted, because trying a lower number is the entire
 * point of a sandbox. On the real tab ADMIN writes real allocations under the
 * same rules as the head; see `canDistribute`, where that permission is marked
 * provisional and the argument against it is written out.
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
  audience,
}: {
  view: StakeDistributionView;
  /** The кафедра's head on the real tab, or ADMIN in their own sandbox */
  canEdit: boolean;
  /** ADMIN only — turns the Мін/Макс column into two editable fields */
  canEditLimits: boolean;
  /**
   * May this viewer open `/staff/[id]`? ADMIN can; a завідувач is an ordinary
   * `USER` and would be redirected away, so their names link to the
   * Характеристика instead — the page about that person they CAN open.
   */
  canOpenStaffProfile: boolean;
  /** Which «Бонус» cell to render — see `BonusCell` */
  audience: 'admin' | 'head';
}) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(view.rows.map((r) => [r.staffId, r.proposedHundredths]))
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // The caps live here rather than in the cell, because the two bounds are one
  // database row: leaving either field has to write both.
  const [limits, setLimits] = useState<Record<string, LimitDraft>>(() =>
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
   * Writes one person's bounds, on leaving either field or clicking a ▲▼.
   *
   * The next pair is passed in rather than read from state, because a stepper
   * click has to write the value it just produced — a `setState` is not visible
   * to the call that follows it.
   *
   * Skipped when nothing changed, so tabbing across a row does not fire a save
   * per column. A cap moves what the formula proposes, so a success refreshes
   * the route — and the grid's key remounts it with the recomputed numbers.
   */
  function commitLimits(row: StakeRow, next: LimitDraft) {
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
      const result = view.sandbox
        ? await saveSandbox({
            departmentId: view.departmentId,
            year: view.year,
            values,
            limits: parseLimits({ ...limits, [row.staffId]: next }),
          })
        : await setStaffLimits(null, limitsFormData(row.staffId, view.year, next));

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

  /**
   * The bonuses, before and after each person's ceiling has had its say.
   *
   * `earned` is what the recruiting actually came to; `paid` is what of it fits
   * under the caps. Both are on screen, because the gap is the thing somebody
   * will ask about — and it is the number the проректор is asked to fix.
   */
  const bonusTotals = useMemo(() => {
    let earned = 0;
    let paid = 0;
    let total = 0;
    for (const row of view.rows) {
      const payable = payableStake(values[row.staffId] ?? 0, row.bonus.total, row.maxHundredths);
      earned += row.bonus.total;
      paid += payable.paidBonus;
      total += payable.total;
    }
    return { earned: roundBonus(earned), paid: roundBonus(paid), total: roundBonus(total) };
  }, [view.rows, values]);

  const dirty = view.rows.some((r) => values[r.staffId] !== r.proposedHundredths);

  function setValue(row: StakeRow, next: number) {
    // The caps are absolute — clamped here as well as on the server, so the
    // ▲▼ buttons simply stop rather than producing a value the save rejects.
    const lower = Math.max(row.minHundredths, MIN_STAKE);
    const upper = Math.max(row.maxHundredths, lower);
    const clamped = Math.min(Math.max(next, lower), upper);

    // «Початкову (автоматичну) ставку можна тільки збільшити» — the sheet's own
    // rule. The formula's number is the floor a head works up from; talking
    // somebody DOWN from what the rating earned them is a decision the
    // положення does not give them.
    //
    // Lifted while the кафедра is over its pool, exactly as the sheet lifts it:
    // otherwise the only way out of an overspend would be forbidden. Lifted in
    // the sandbox too — trying a smaller number is what a sandbox is for, and
    // nothing there is paid to anybody.
    if (!view.sandbox && !overspent && clamped < row.formulaHundredths) {
      setError(
        `${row.name}: ставку за формулою (${formatStake(row.formulaHundredths)}) можна лише збільшити`
      );
      return;
    }

    setValues((v) => ({ ...v, [row.staffId]: clamped }));
    setError(null);
  }

  /**
   * Back to what the formula proposes, and SAVED.
   *
   * There is no save button any more; every other edit is written when a field
   * is left, and this one has no field to leave. A reset that only changed the
   * screen looked identical to a saved one until the page was reloaded and the
   * old numbers came back.
   */
  function reset() {
    const next = Object.fromEntries(view.rows.map((r) => [r.staffId, r.formulaHundredths]));
    setValues(next);
    setError(null);
    // Saved from the values just computed, not from state — a setState is not
    // visible to the call that follows it.
    save(next);
  }

  /**
   * Why an autosave is being held back, or null when it can go ahead.
   *
   * Only one thing holds it: no allocation to spread. An обґрунтування is NOT
   * one of them — додаток 2 has the column and the head may fill it, but nothing
   * requires them to. Nor is an overspend, which is allowed and merely said.
   */
  const blockedBy: string | null =
    kst === null && !view.sandbox ? 'Кст ще не встановлено — зверніться до адміністратора' : null;

  /**
   * Over the pool — allowed, and said out loud.
   *
   * Not a блок: the sheet the кафедри already use permits it and asks for it to
   * be written into the протокол, and refusing it here left a head with nothing
   * they could do once «тільки збільшити» was in force.
   */
  const overspendWarning =
    overspent && remaining !== null
      ? `Перевищення розподілу на ${formatStake(-remaining)} — не забудьте врахувати у протоколі`
      : null;

  /**
   * Saves the whole кафедра, on leaving a field.
   *
   * The whole grid and not the one row, because `Кст` bounds the SET: a head
   * moving 0.10 from one person to another would be refused on the first half
   * of the move if rows saved independently.
   */
  function save(nextValues: Record<string, number>) {
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      const result = view.sandbox
        ? await saveSandbox({
            departmentId: view.departmentId,
            year: view.year,
            values: nextValues,
            limits: parseLimits(limits),
          })
        : await saveDistribution({
            departmentId: view.departmentId,
            year: view.year,
            allocations: view.rows.map((r) => ({
              staffId: r.staffId,
              hundredths: nextValues[r.staffId],
            })),
          });

      if (result && 'error' in result) setError(result.error);
      else {
        setSavedAt(Date.now());
        toast.success(view.sandbox ? 'Збережено в пісочниці' : 'Збережено');
      }
    });
  }

  function saveOnBlur() {
    if (!dirty || blockedBy) return;
    save(values);
  }

  return (
    // An ordinary block, NOT a `h-full` flex column. It used to be one, which
    // worked only while the grid was the last thing on the page: the moment
    // anything followed it, `flex-1` had nothing left to claim and the table
    // collapsed to the height of its own scrollbar. The rows scroll inside a
    // bounded box instead, which cannot be squeezed by a sibling.
    <div className="flex flex-col gap-4">
      <Totals
        kst={kst}
        distributed={distributed}
        remaining={remaining}
        overspent={overspent}
        // Attached to the number it is about rather than shouted in a band of
        // its own. An overspend is allowed — it is a fact for the протокол, not
        // a mistake to fix before saving — and a full-width amber row for it
        // pushed the table another line down every time somebody typed.
        remainingNote={overspendWarning}
        bonus={bonusTotals}
        formulaTotal={view.formulaTotalHundredths}
        actions={
          canEdit && view.rows.length > 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={reset} disabled={pending}>
                <RotateCcw className="size-4" />
                Повернути до формули
              </Button>

              {/* There is no save button: a change is written when the field is
                  left. What this says is what state that leaves things in,
                  because a silent autosave is indistinguishable from a lost
                  edit — especially while a change is being HELD BACK, which is
                  the one case where leaving a field does not write anything. */}
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
            </>
          ) : null
        }
        filled={
          view.filledAt
            ? `Заповнив: ${view.filledBy ?? '—'}, ${view.filledAt.toLocaleDateString('uk-UA')}`
            : null
        }
      />

      {!view.computable && (
        <p className="rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          {view.knpp === 0
            ? 'Кнпп = 0 — на кафедрі немає НПП із 4+ позиціями ліцензійних умов, тому формула не рахується. Усі отримують мінімальну ставку, доки це не зміниться.'
            : 'Ні в кого немає рейтингових балів за цей рік, тому формула не рахується.'}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* The rows scroll inside this, with the headings pinned — a кафедра of
          thirty does not push «Усі кафедри» off the bottom of the world, and a
          кафедра of three takes only the height it needs. Dashed while this is
          a sandbox, so a screenshot of it can never be mistaken for the
          кафедра's actual distribution. */}
      <div
        className={cn(
          'max-h-[min(60vh,40rem)] overflow-auto rounded-xl border bg-card',
          view.sandbox && 'border-2 border-dashed'
        )}
      >
        {/* Headings are pinned, because scrolling a кафедра of thirty carries
            «Розподілено» and «Макс» off the top otherwise, and the columns are
            all numbers that look alike. Each cell needs its own background:
            rows would show through the row's translucent tint. */}
        <table className="w-full border-collapse text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted">
          <thead>
            <tr className="text-left">
              {/* НПП carries text and takes what is left; every other column is
                  a number or a control of known size. `whitespace-nowrap` on the
                  headings is the point: a heading that wraps sets the height of
                  the whole row, and the widths below are chosen to hold each
                  label on one line. */}
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
                  canEditLimits ? 'w-32' : 'w-20 text-right'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  Мін
                  <StakeTermHint term="min" />
                </span>
              </th>
              <th
                className={cn(
                  'border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground',
                  canEditLimits ? 'w-32' : 'w-20 text-right'
                )}
              >
                {/* Макс had no explanation at all, and it is the one bound that
                    also moves the formula — a lower ceiling makes the proposal
                    smaller, which is not guessable from the column. */}
                <span className="inline-flex items-center gap-1">
                  Макс
                  <StakeTermHint term="max" />
                </span>
              </th>
              <th className="w-40 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
                Розподілено
              </th>
              <th
                className={cn(
                  'border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground',
                  audience === 'head' ? 'w-52' : 'w-28'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  Бонус
                  <StakeTermHint term="bonus" />
                </span>
              </th>
              <th className="w-24 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Разом
                  <StakeTermHint term="total" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <Row
                key={row.staffId}
                row={row}
                view={view}
                audience={audience}
                value={values[row.staffId]}
                canEdit={canEdit}
                canEditLimits={canEditLimits}
                canOpenStaffProfile={canOpenStaffProfile}
                disabled={pending}
                limits={limits[row.staffId] ?? { min: '', max: '' }}
                limitError={limitErrors[row.staffId] ?? null}
                limitsPending={limitsPending}
                onChange={(next) => setValue(row, next)}
                onBlur={saveOnBlur}
                onLimitChange={(bound, next) =>
                  setLimits((l) => ({
                    ...l,
                    [row.staffId]: { ...l[row.staffId], [bound]: next },
                  }))
                }
                onLimitCommit={(next) => commitLimits(row, next)}
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

      {/* Only for the head, and only when the довідник cannot place their
          кафедра. Without it a column of gray chips is an unexplained absence
          of colour rather than an answer. */}
      {audience === 'head' && !view.knownDepartment && (
        <p className="text-xs text-muted-foreground">
          Спеціальності у колонці «Бонус» показані сірим: цієї кафедри немає в довіднику випускових
          кафедр, тому визначити «своя / чужа» неможливо.
        </p>
      )}
    </div>
  );
}

/** The drafts as hundredths, dropping anything unparseable rather than sending NaN */
function parseLimits(
  drafts: Record<string, LimitDraft>
): Record<string, { min: number; max: number }> {
  const parsed: Record<string, { min: number; max: number }> = {};
  for (const [staffId, draft] of Object.entries(drafts)) {
    const min = parseStake(draft.min);
    const max = parseStake(draft.max);
    if (min === null || max === null) continue;
    parsed[staffId] = { min, max };
  }
  return parsed;
}

function limitsFormData(staffId: string, year: number, next: LimitDraft): FormData {
  const form = new FormData();
  form.set('staffId', staffId);
  form.set('year', String(year));
  form.set('min', next.min);
  form.set('max', next.max);
  return form;
}

/**
 * The totals, separately — and «разом» is no longer a free addition.
 *
 * `Кст` bounds the pool share and nothing else, so the bonus stays its own
 * figure. What changed on 2026-08-12 is that the bonus has a ceiling of its own:
 * it cannot lift anybody above their Макс. When some of it does not fit, both
 * numbers are shown — what was earned and what is paid — because the difference
 * is exactly what somebody takes to the проректор.
 */
function Totals({
  kst,
  distributed,
  remaining,
  overspent,
  remainingNote,
  bonus,
  formulaTotal,
  actions,
  filled,
}: {
  kst: number | null;
  distributed: number;
  remaining: number | null;
  overspent: boolean;
  remainingNote: string | null;
  bonus: { earned: number; paid: number; total: number };
  formulaTotal: number;
  /** «Повернути до формули» and the autosave status, when this viewer may edit */
  actions: React.ReactNode;
  filled: string | null;
}) {
  const capped = roundBonus(bonus.earned - bonus.paid) > 0;

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 px-5 py-4">
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
          note={remainingNote ?? undefined}
          noteTone={remainingNote ? 'warn' : undefined}
        />
        <Figure
          label="Бонус за здобувачів"
          term="bonus"
          value={formatBonus(bonus.earned)}
          note={capped ? `у межах Макс: ${formatBonus(bonus.paid)}` : undefined}
          muted
        />
        {/* The sum, not the expression. «12,65 + 0,000» as the headline number is
            arithmetic the reader has to finish themselves; the two parts stay
            visible underneath, which is the thing that must not be lost. */}
        <Figure
          label="Разом до виплати"
          term="total"
          value={formatBonus(bonus.total)}
          note={`${formatStake(distributed)} + ${formatBonus(bonus.paid)}`}
          muted
        />
        <span className="ml-auto inline-flex items-center gap-1 self-center text-xs text-muted-foreground">
          Формула пропонує: {formatStake(formulaTotal)}
          <StakeTermHint term="formulaTotal" />
        </span>
      </div>

      {/* The controls belong to these numbers, so they share the card instead
          of taking a row of their own underneath it. */}
      {(actions || filled) && (
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-2.5">
          {actions}
          {filled && <span className="ml-auto text-xs text-muted-foreground">{filled}</span>}
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  term,
  note,
  noteTone,
  tone,
  muted,
}: {
  label: string;
  value: string;
  /** Which entry of STAKE_TERMS explains this number */
  term?: StakeTerm;
  /** How the number is made up, under the label */
  note?: string;
  /** Amber when the note is a condition to act on, not just arithmetic */
  noteTone?: 'warn';
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
      {note && (
        <p
          className={cn(
            'max-w-52 text-xs',
            noteTone === 'warn'
              ? 'text-amber-700 dark:text-amber-500'
              : 'text-muted-foreground/70 tabular-nums'
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * One bound — either the floor or the ceiling — for one person. ADMIN only.
 *
 * Its own column and its own field, with ▲▼ like every other ставка on the
 * grid, saved when the field is left. The two bounds are one database row, so
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
  draft,
  editable,
  disabled,
  error,
  onChange,
  onCommit,
}: {
  row: StakeRow;
  bound: 'min' | 'max';
  draft: LimitDraft;
  editable: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (next: string) => void;
  onCommit: (next: LimitDraft) => void;
}) {
  const label = bound === 'min' ? 'Мінімальна' : 'Максимальна';
  // Ukrainian needs the accusative after «збільшити … ставку», so the stepper
  // gets its own form rather than a lower-cased `label` — «збільшити
  // мінімальна ставку» is not a sentence.
  const accusative = bound === 'min' ? 'мінімальну' : 'максимальну';
  const value = draft[bound];

  if (!editable) {
    // A head sees the bounds they are working inside but cannot move them.
    return (
      <td className="border border-border px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
        {value}
      </td>
    );
  }

  const stored = bound === 'min' ? row.minHundredths : row.maxHundredths;
  // A ▲▼ has to write the value it just produced, so it builds the next pair
  // itself instead of waiting for state that has not been applied yet.
  function step(next: number) {
    const text = formatStake(next);
    onChange(text);
    onCommit({ ...draft, [bound]: text });
  }

  return (
    <td className="border border-border px-3 py-2">
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(draft)}
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
            // Dimmed while these are the defaults, so «set for this person»
            // still reads differently from «nobody has decided» without a word
            // of text repeated down every row.
            !row.hasOwnLimits && 'text-muted-foreground',
            error && 'border-destructive'
          )}
        />
        <StakeStepper
          value={parseStake(value) ?? stored}
          onChange={step}
          disabled={disabled}
          // A floor never goes under 0,10 — nobody is left without a ставка.
          // A ceiling has no upper bound here: raising it is the point.
          min={MIN_STAKE}
          label={`${accusative} ставку для ${row.name}`}
        />
      </div>
      {error && <p className="mt-1 max-w-40 text-xs text-destructive">{error}</p>}
    </td>
  );
}

function Row({
  row,
  view,
  audience,
  value,
  canEdit,
  canEditLimits,
  canOpenStaffProfile,
  disabled,
  limits,
  limitError,
  limitsPending,
  onChange,
  onBlur,
  onLimitChange,
  onLimitCommit,
}: {
  row: StakeRow;
  view: StakeDistributionView;
  audience: 'admin' | 'head';
  value: number;
  canEdit: boolean;
  canEditLimits: boolean;
  canOpenStaffProfile: boolean;
  disabled: boolean;
  limits: LimitDraft;
  limitError: string | null;
  limitsPending: boolean;
  onChange: (next: number) => void;
  onBlur: () => void;
  onLimitChange: (bound: 'min' | 'max', next: string) => void;
  onLimitCommit: (next: LimitDraft) => void;
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
  // A saved allocation can fall outside its bounds without anybody touching it
  // — ADMIN lowers a cap under a number the head already agreed. The save
  // refuses it, so say so on the field instead of only at the moment of saving.
  const outOfRange = value < lower || value > upper;

  const payable = payableStake(value, row.bonus.total, row.maxHundredths);

  return (
    <tr className="transition-colors hover:bg-muted/20">
      <td className="border border-border px-3 py-2 align-middle">
        {/* Opens in a new tab on purpose: this grid holds unsaved work, and
            navigating away in place would drop it. */}
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
        draft={limits}
        editable={canEditLimits}
        disabled={disabled || limitsPending}
        error={limitError}
        onChange={(next) => onLimitChange('min', next)}
        onCommit={onLimitCommit}
      />
      <LimitCell
        row={row}
        bound="max"
        draft={limits}
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
          <StakeStepper
            value={value}
            onChange={onChange}
            disabled={!canEdit || disabled}
            min={lower}
            max={upper}
            step={STAKE_STEP}
            label={`ставку для ${row.name}`}
          />
        </div>
      </td>

      <td className="border border-border px-3 py-2 text-right text-xs tabular-nums">
        <BonusCell
          bonus={row.bonus}
          audience={audience}
          departmentName={view.departmentName}
          knownDepartment={view.knownDepartment}
        />
      </td>

      <td className="border border-border px-3 py-2 text-right font-medium tabular-nums">
        {formatBonus(payable.total)}
        {/* The bonus that did not fit. Shown rather than dropped: it is what
            somebody takes to the проректор when they think they should hold
            more, and a silently missing 0,14 looks like an arithmetic bug. */}
        {payable.overflow > 0 && (
          <span
            className="block text-[10px] font-normal text-muted-foreground"
            title={`Бонус ${formatBonus(row.bonus.total)} не вміщується під Макс ${formatStake(row.maxHundredths)}`}
          >
            +{formatBonus(payable.overflow)} понад межу
          </span>
        )}
      </td>
    </tr>
  );
}
