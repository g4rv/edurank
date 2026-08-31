'use client';

import { useEffect, useMemo, useReducer, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { round2 } from '@/lib/round';
import {
  MIN_STAKE,
  STAKE_STEP,
  formatBonus,
  formatStake,
  formatStakeValue,
  fromHundredths,
  parseStake,
  roundBonus,
  snapToStep,
} from '@/lib/stake/units';

import type { StakeDistributionView, StakeRow } from '@/lib/queries/get-stake-distribution';
import {
  draftReducer,
  initialDraft,
  isDirty,
  neverStoredRows,
} from '@/components/stake/distribution-draft';
import { StakeTermHint, type StakeTerm } from '@/components/stake/stake-term-hint';
import { StakeStepper } from '@/components/stake/stake-stepper';
import { BonusCell } from '@/components/stake/bonus-cell';
import { StatusCell } from '@/components/stake/status-cell';
import { recommendedStake, statusValue } from '@/lib/stake/status-bonus';
import { fundSplit } from '@/lib/stake/pool-totals';
import {
  lowerBound,
  openingStake,
  settleStake,
  stakeCeiling,
  upperBound,
  type StakeBounds,
} from '@/lib/stake/settle';
import type { AdminPosition } from '@/lib/generated/prisma/client';
import { saveDistribution, setStaffLimits } from '@/app/(dashboard)/stakes/actions';

/** The two bounds of one row, as typed */
type LimitDraft = { min: string; max: string };

/**
 * Додаток 2 — the head spreads the pool by hand, with the formula's own answer
 * beside each row and «нерозподілено» falling as they type.
 *
 * **Nothing is written until «Зберегти ставки»** (owner, 2026-08-24). Both ways
 * of changing a ставка go through `applyValue` — the ▲▼ buttons and a typed
 * value when the field is left — but they move the screen only. Autosave-per-edit
 * came before that and gave a кафедра nobody had committed the look of a saved
 * one.
 *
 * It writes the WHOLE grid, never the one row, because `Кст` bounds the set: a
 * head moving 0.10 from one person to another would be refused on the first
 * half of the move if rows saved on their own.
 *
 * ADMIN writes real allocations under the same rules as the head; see
 * `canDistribute`, where that permission is marked provisional and the argument
 * against it is written out. The scratch tab that used to sit beside this one is
 * gone (2026-08-17, owner's call).
 *
 * Ліміти are shown to everyone and editable by whoever may edit the split —
 * ADMIN or the кафедра's own head (owner, 2026-08-26, retracting the ADMIN-only
 * rule of 2026-08-05). They were a control ADMIN held over the head; they are
 * the head's own tool now, and what records a cap being moved is the audit
 * entry rather than the permission.
 *
 * It also ends a deadlock: a cap ADMIN dropped beneath a ставка already saved
 * left the row failing every save, and only ADMIN could clear it. A декан
 * still reads and writes nothing.
 */
export function DistributionGrid({
  view,
  canEdit,
  canEditLimits,
  canOpenStaffProfile,
  audience,
  statusValues,
  warnOverwrite = false,
  filledBy,
  filledAt,
}: {
  view: StakeDistributionView;
  /** The кафедра's head, or ADMIN */
  canEdit: boolean;
  /** Turns the Мін/Макс column into two editable fields — ADMIN or the кафедра's head */
  canEditLimits: boolean;
  /**
   * May this viewer open `/staff/[id]`? ADMIN can; a завідувач is an ordinary
   * `USER` and would be redirected away, so their names link to the
   * Характеристика instead — the page about that person they CAN open.
   */
  canOpenStaffProfile: boolean;
  /** Which «Здобувачі» cell to render — see `BonusCell` */
  audience: 'admin' | 'head';
  /** What ADMIN priced each administrative position at, in hundredths */
  statusValues: Record<AdminPosition, number | undefined>;
  /** ADMIN is about to type over a split somebody else already saved */
  warnOverwrite?: boolean;
  filledBy?: string | null;
  filledAt?: Date | null;
}) {
  /**
   * The формула's own proposal does not fit inside the two funds.
   *
   * Ladder rounding alone can do it — 3,05 proposed against a 3,00 pool — and
   * then no split inside the funds can keep everybody at or above their own
   * share. «Тільки збільшити» therefore steps aside for the whole кафедра, on
   * this screen and in `saveDistribution` alike; otherwise the head has no
   * legal move that gets them back on budget.
   */
  const formulaOverspends =
    view.kstHundredths !== null &&
    view.formulaTotalHundredths > view.kstHundredths + (view.bonusPoolHundredths ?? 0);

  /**
   * What every row opens on.
   *
   * The rule — stored value, bounds, the frozen «тільки збільшити» floor and its
   * overspend exception — lives in `openingStake` (`lib/stake/settle.ts`), where
   * it is tested and where **`/stakes` calls it too**. It was thirty lines here,
   * and being here was the bug: the overview could not reuse it, summed the
   * stored allocations instead, and the two screens printed «Залишок» a whole
   * ставка apart (2026-08-31).
   */
  const seed = () =>
    Object.fromEntries(view.rows.map((r) => [r.staffId, openingStake(r, formulaOverspends)]));

  /**
   * What is on screen, what the server holds, and who has been written this
   * session — one value, in `distribution-draft.ts`.
   *
   * Three `useState` calls once, which had to be kept in agreement by hand and
   * were not: «Незбережені зміни» is a question about all three at once, and
   * every bug this grid has had was that question answered wrongly. They are one
   * reducer now so the rule is a pure function with tests of its own, instead of
   * something only a person clicking the screen could check.
   */
  const [draft, dispatch] = useReducer(draftReducer, undefined, () => initialDraft(seed()));
  const { values } = draft;

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
   * per column.
   *
   * A cap moves what the формула proposes for EVERY row, so a success refreshes
   * the route and the grid remounts on its new key — see `limitsSignature` on
   * the page. That claim used to be made here and was not true: the key was the
   * кафедра id alone, which does not change across a refresh, so React kept the
   * instance and every row's state with it.
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
      const result = await setStaffLimits(
        null,
        limitsFormData(row.staffId, view.departmentId, view.year, next)
      );

      if (result && 'error' in result) {
        setLimitErrors((e) => ({ ...e, [row.staffId]: result.error }));
      } else {
        setLimitErrors((e) => {
          const { [row.staffId]: _dropped, ...rest } = e;
          return rest;
        });

        // Correcting the one edited row here used to be the whole fix, and it
        // only ever addressed the one row. `setStaffLimits` now re-settles the
        // кафедра's stored allocations itself, so the refresh below brings back
        // numbers that are already right for everybody — and the remount seeds
        // from them. Nothing is lost by that: every edit autosaves, so there is
        // no unsaved state for a remount to throw away.
        router.refresh();
      }
    });
  }

  const kst = view.kstHundredths;

  const distributed = useMemo(() => Object.values(values).reduce((sum, v) => sum + v, 0), [values]);
  /**
   * What is left of BOTH funds — and «перевищення» means past both of them.
   *
   * It used to measure against `Кст` alone, which was right while there was one
   * fund and wrong the moment there were two: a кафедра with 2,00 основний and
   * 1,00 бонусний that had handed out 2,25 was told it had overspent by 0,25
   * while 0,75 sat unspent in the second fund (2026-08-17, seen on screen).
   *
   * The base fund fills first and only the excess comes from the bonus fund —
   * the same attribution the cards use, so the three numbers agree.
   */
  const bonusPool = view.bonusPoolHundredths ?? 0;
  const remaining = kst === null ? null : kst + bonusPool - distributed;
  const overspent = remaining !== null && remaining < 0;

  /**
   * How much more the кафедра may hand out — never below zero.
   *
   * **A raise stops at what is left** (owner, 2026-08-17): «better that 0,05 is
   * left over than that it goes to −100». A ▲ that would cross the funds greys
   * out, and a typed 1,50 settles on whatever actually fits.
   *
   * Zero when the кафедра is ALREADY over, which is the case this has to be
   * careful about. Refusing an overspend outright was tried and deadlocked the
   * grid (see `saveDistribution`): the formula's own proposal can sit a few
   * hundredths above `Кст` from ladder rounding alone, and a head may only raise
   * a value, so кафедра географії opened at 2,10 against a pool of 2,00 with no
   * legal move at all. So the rule is «you may not make it worse», not «it may
   * never be negative» — going DOWN stays open, because `stakeFloor` drops to
   * the person's Мін while the кафедра is over.
   */
  const headroom = remaining === null ? 0 : Math.max(0, remaining);

  /**
   * Is «тільки збільшити» lifted?
   *
   * Two ways in, and they are not the same thing. The кафедра being over right
   * now needs a way back down. A формула that oversubscribes the funds needs it
   * permanently: somebody has to sit below their share for the кафедра to be on
   * budget at all, and once the head puts them there the total is no longer
   * over — so a check on the live total alone would take the floor away again
   * and refuse to re-save the very split it just accepted.
   */
  const floorLifted = overspent || formulaOverspends;

  /** Every bound that applies to one row, gathered for `settleStake` */
  const boundsFor = (row: StakeRow): StakeBounds => ({
    rating: row.rating,
    minHundredths: row.minHundredths,
    maxHundredths: row.maxHundredths,
    // The floor «тільки збільшити» works from — frozen at the last human save,
    // so a ▼ stops where the head last put this person rather than where
    // today's формула would.
    formulaHundredths: row.savedFormulaHundredths ?? row.formulaHundredths,
    headroom,
    overspent: floorLifted,
  });

  /**
   * What the кафедра's people earned by recruiting — and nothing more.
   *
   * **It is not added to anybody's ставка here (2026-08-17).** Recruitment is
   * paid out in a SECOND phase, months later: the проректор raises `Кст`, the
   * phase-1 numbers stay put, and the head hands out the increase by hand using
   * these figures as the argument. Somebody who recruited fifty students but has
   * no room gets nothing automatically — that conversation happens off-screen.
   *
   * So this figure is evidence, not money. The grid used to add it into a «Разом
   * до виплати» and clip it at Макс, which stated a payment nobody had decided.
   */
  const bonusEarned = useMemo(
    () => roundBonus(view.rows.reduce((sum, row) => sum + row.bonus.total, 0)),
    [view.rows]
  );

  /**
   * Is any chip in the «Бонус» column gray?
   *
   * `origin` is decided per chip on the server (`getStakeDistribution`), so
   * this кафедра not being in the довідник and a спеціальність nobody
   * graduates both surface here the same way — a column of gray chips is an
   * unexplained absence of colour without the note below.
   */
  const hasUnknownOrigin = useMemo(
    () =>
      view.rows.some((row) => row.bonus.bySpeciality.some((entry) => entry.origin === 'unknown')),
    [view.rows]
  );

  /**
   * People whose row has never been written — the формула drew their number and
   * nothing stored it. They count as unsaved work even though nobody typed
   * anything, which is the whole point: a кафедра that gained a сумісник after
   * it was spread otherwise looked finished (2026-08-24).
   */
  const neverStored = neverStoredRows(draft, view.rows);

  const dirty = isDirty(draft, view.rows);

  // Nothing is written until «Зберегти», so closing the tab or refreshing now
  // throws work away. The browser shows its own wording — a custom message has
  // been ignored by every browser for years — and the Back button cannot be
  // guarded at all. That gap is the cost of dropping autosave, accepted by the
  // owner on 2026-08-24.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /**
   * The overwrite confirmation, asked once and at the moment it matters.
   *
   * A standing banner sat above the table saying somebody else had filled this
   * кафедра in. It was there while ADMIN was only reading, and it repeated what
   * the toolbar's «Заповнив: …» already said. Asking at the decision is the
   * point (owner, 2026-08-17).
   *
   * **Moved from the first edit to the save** (2026-08-24). It guarded editing
   * because editing was what wrote; now nothing writes until «Зберегти», so a
   * dialog on the first keystroke would warn about an overwrite that might
   * never happen — and say nothing at the moment it does.
   */
  const [askOverwrite, setAskOverwrite] = useState<null | (() => void)>(null);
  const [overwriteOk, setOverwriteOk] = useState(!warnOverwrite);

  /** Editing changes the proposal only, so it needs no confirmation any more. */
  function setValue(row: StakeRow, next: number) {
    applyValue(row, next);
  }

  /** The save, behind the overwrite question when somebody else filled this кафедра. */
  function guardedSave(nextValues: Record<string, number>) {
    if (!overwriteOk) {
      setAskOverwrite(() => () => save(nextValues));
      return;
    }
    save(nextValues);
  }

  /**
   * Puts one row's ставка in range and WRITES it.
   *
   * Saving is driven by the map this function builds, never by `values` — a
   * `setState` is not visible to the call that follows it, which is the same
   * trap `commitLimits` above was already written around. Two bugs came from
   * missing it here (2026-08-17, reported from the screen):
   *
   * - **▲▼ never saved at all.** The stepper called this, this called
   *   `setValues`, and nothing wrote. A head who spread a whole кафедра with
   *   the buttons and navigated away lost every number.
   * - **The first typed edit was dropped too.** The field saved on blur through
   *   a `dirty` flag computed during render, so on a freshly loaded grid — where
   *   nothing differs yet — `dirty` was still false when the blur handler ran and
   *   the save was skipped. It only appeared to work because any LATER blur saw
   *   the earlier change and wrote everything at once.
   */
  function applyValue(row: StakeRow, next: number) {
    // Every bound at once — caps, «тільки збільшити», the funds and the ladder.
    // They interact, so they are decided together in `lib/stake/settle.ts` and
    // tested there rather than being four expressions in a component.
    //
    // **Enforced by the value, not by a message.** A rule the control simply
    // obeys does not need announcing: the ▼ stops at the formula, the ▲ stops at
    // what is left, and a typed value settles between them — which says the same
    // thing without an error for something nobody did wrong.
    const current = values[row.staffId];
    const settled = settleStake(next, current, boundsFor(row));

    setError(null);
    // Nothing moved — a ▼ already at the floor, a ▲ against a spent fund, or a
    // typed value that parses back to what is on screen. Writing the whole
    // кафедра for that would put a «Збережено» toast on a click that did nothing.
    if (settled === current) return;

    // Changed on screen only. Nothing reaches the database until «Зберегти»
    // (owner, 2026-08-24) — autosave-per-edit wrote a row for every ▲ press and
    // gave a кафедра nobody had committed the look of a saved one.
    dispatch({ type: 'set', staffId: row.staffId, hundredths: settled });
  }

  /**
   * Back to what the formula proposes — on screen only.
   *
   * It used to save itself, because there was no button to press afterwards.
   * There is one now (2026-08-24), and a reset that wrote itself while an
   * ordinary edit did not would be the odd one out.
   */
  function reset() {
    // Proposes, and stops there. It used to save, because there was no button
    // to press afterwards; now there is one, and a reset that wrote itself
    // while an ordinary edit did not would be the odd one out.
    dispatch({
      type: 'reset',
      values: Object.fromEntries(view.rows.map((r) => [r.staffId, r.formulaHundredths])),
    });
    setError(null);
  }

  /**
   * Why an autosave is being held back, or null when it can go ahead.
   *
   * Only one thing holds it: no allocation to spread. An обґрунтування is NOT
   * one of them — додаток 2 has the column and the head may fill it, but nothing
   * requires them to. Nor is an overspend, which is allowed and merely said.
   *
   * **Addressed to ADMIN, because nobody else gets here without a fund**
   * (2026-08-17). A завідувач and a декан now meet an explanation on the page
   * instead of this grid, so the old «зверніться до адміністратора» was telling
   * the administrator to contact themselves. They can still set Мін/Макс here —
   * those write through `setStaffLimits` and need no fund — which is why the
   * grid is not simply hidden from them too.
   */
  const blockedBy: string | null =
    kst === null
      ? 'Основний фонд не задано — ставки не збережуться. Задайте його на «Усі кафедри»'
      : null;

  /**
   * Over the pool — allowed, and said out loud.
   *
   * Not a блок: refusing it left a head with nothing they could do once «тільки
   * збільшити» was in force.
   *
   * **There is no протокол** (owner, 2026-08-25). The sentence used to end «не
   * забудьте врахувати у протоколі», which told the head to file something that
   * does not exist. It states the fact and stops.
   */
  const overspendWarning =
    overspent && remaining !== null
      ? `Перевищення на ${formatStake(-remaining)} понад обидва фонди`
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
      const result = await saveDistribution({
        departmentId: view.departmentId,
        year: view.year,
        allocations: view.rows.map((r) => ({
          staffId: r.staffId,
          hundredths: nextValues[r.staffId],
        })),
      });

      if (result && 'error' in result) setError(result.error);
      else {
        // `nextValues` — the map that was actually sent, not whatever is on
        // screen now. A head who kept typing while the request was in flight
        // still has unsaved work, and saying otherwise would lose it silently.
        dispatch({
          type: 'saved',
          values: nextValues,
          staffIds: view.rows.map((r) => r.staffId),
        });
        setSavedAt(Date.now());
        toast.success('Збережено');
      }
    });
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
        bonusPool={view.bonusPoolHundredths}
        overspent={overspent}
        // Attached to the number it is about rather than shouted in a band of
        // its own. An overspend is allowed — it is shown, not
        // a mistake to fix before saving — and a full-width amber row for it
        // pushed the table another line down every time somebody typed.
        remainingNote={overspendWarning}
        bonusEarned={bonusEarned}
        formulaTotal={view.formulaTotalHundredths}
        actions={
          canEdit && view.rows.length > 0 ? (
            <>
              {/* The one thing that writes to the database (owner, 2026-08-24).
                  Everything else on this screen changes the proposal only.

                  Disabled when there is genuinely nothing to store — and note
                  `dirty` counts a row that has NEVER been written, not only a
                  value somebody typed. Without that half, a сумісник added to
                  an already-spread кафедра would leave the button greyed out on
                  exactly the case it exists for. */}
              <Button
                size="sm"
                onClick={() => guardedSave(values)}
                disabled={pending || !dirty || !!blockedBy}
                title={
                  neverStored.length > 0
                    ? `Незбережено: ${neverStored.map((r) => r.name).join(', ')}`
                    : undefined
                }
              >
                <Save className="size-4" />
                {pending ? 'Збереження…' : 'Зберегти ставки'}
              </Button>
              {/* Behind a confirmation, by request (2026-08-17). It overwrites
                  every row on the кафедра at once, including numbers the
                  завідувач argued over and typed by hand, and «Повернути» reads
                  like an undo of the last thing rather than of all of them. The
                  dialog says how many rows and what happens to them. */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={pending || !!blockedBy}>
                    <RotateCcw className="size-4" />
                    Повернути до формули
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Повернути до формули?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ставки всіх {view.rows.length} НПП кафедри буде замінено на ті, що пропонує
                      формула. Усе, що ви змінили вручну, буде втрачено. Формула розподілить{' '}
                      {formatStake(view.formulaTotalHundredths)} з основного фонду.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
                    <AlertDialogAction type="button" onClick={reset}>
                      Повернути
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* What state the grid is in, said out loud: unsaved, saving,
                  saved, or held back because there is no Кст to save against.
                  «Незбережені зміни» matters most — everything on this screen
                  moves the proposal only, and closing the tab loses it. */}
              <span className="text-xs">
                {pending ? (
                  <span className="text-muted-foreground">Збереження…</span>
                ) : blockedBy ? (
                  // Said BEFORE anything is typed, not after (2026-08-17). It
                  // used to wait for `dirty`, so a head with no Кст met a grid
                  // that looked ordinary, typed into it, and only then learned
                  // nothing could be saved — and only they could not fix it.
                  <span className="text-amber-700 dark:text-amber-500">{blockedBy}</span>
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

      {/* Raised by the first edit, not shown beside the table. Asked once: after
          «Продовжити» the rest of the session edits freely, because repeating it
          per keystroke would be the banner again, only worse. */}
      <AlertDialog
        open={askOverwrite !== null}
        onOpenChange={(open) => !open && setAskOverwrite(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Розподіл уже заповнено</AlertDialogTitle>
            <AlertDialogDescription>
              Цю кафедру заповнив {filledBy ?? '—'}
              {filledAt ? `, ${filledAt.toLocaleDateString('uk-UA')}` : ''}. Ваші зміни перезапишуть
              його розподіл і будуть записані на вас.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={() => setAskOverwrite(null)}>
              Скасувати
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                const apply = askOverwrite;
                setOverwriteOk(true);
                setAskOverwrite(null);
                apply?.();
              }}
            >
              Продовжити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The rows scroll inside this, with the headings pinned — a кафедра of
          thirty does not push «Усі кафедри» off the bottom of the world, and a
          кафедра of three takes only the height it needs. Dashed while this is
*/}
      <div className={cn('max-h-[min(60vh,40rem)] overflow-auto rounded-xl border bg-card')}>
        {/* Headings are pinned, because scrolling a кафедра of thirty carries
            «Розподілено» and «Макс» off the top otherwise, and the columns are
            all numbers that look alike. Each cell needs its own background:
            rows would show through the row's translucent tint. */}
        <table className="w-full border-collapse text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted">
          <thead>
            <tr className="text-left">
              {/* Column order is the owner's, given 2026-08-17 and not to be
                  rearranged again: ПІБ → рейтинг → здобувачі → статуси → мін →
                  макс → ставка → рекомендовано. It reads as one sentence — who
                  they are, what they scored, what they brought in, what bounds
                  them, what they get, what they were owed.

                  «За формулою» is deliberately NOT a column of its own. It was
                  added as one and taken out again: the owner's list does not
                  have it, and the number matters in exactly one place — under
                  the ставка it is the floor for. It sits there instead. */}
              <th className="min-w-40 border border-border px-2 py-2 font-medium whitespace-nowrap text-muted-foreground">
                НПП
              </th>
              <th className="w-20 border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                Рейтинг
              </th>
              <th
                className={cn(
                  'border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground',
                  audience === 'head' ? 'w-52' : 'w-28'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  Здобувачі
                  <StakeTermHint term="bonus" />
                </span>
              </th>
              <th className="w-24 border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Статуси
                  <StakeTermHint term="status" />
                </span>
              </th>
              <th
                className={cn(
                  'border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground',
                  canEditLimits ? 'w-28' : 'w-20'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  Мін
                  <StakeTermHint term="min" />
                </span>
              </th>
              <th
                className={cn(
                  'border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground',
                  canEditLimits ? 'w-28' : 'w-20'
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
              <th className="w-28 border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  За формулою
                  <StakeTermHint term="formula" />
                </span>
              </th>
              <th className="w-32 border border-border px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
                Ставка
              </th>
              <th className="w-24 border border-border px-2 py-2 text-right font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Рекомендовано
                  <StakeTermHint term="recommended" />
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
                overspent={floorLifted}
                statusValues={statusValues}
                // Only the ставка field. With no Кст the distribution cannot be
                // saved, so an enabled field there is an invitation to lose
                // work — but Мін/Макс write through `setStaffLimits`, which does
                // not need a pool, and ADMIN may legitimately set bounds before
                // the проректор funds the кафедра.
                distributionBlocked={!!blockedBy}
                headroom={headroom}
                limits={limits[row.staffId] ?? { min: '', max: '' }}
                limitError={limitErrors[row.staffId] ?? null}
                limitsPending={limitsPending}
                onChange={(next) => setValue(row, next)}
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

      {/* Only for the head, and only when at least one chip came back
          `unknown`. Without it a gray chip is an unexplained absence of
          colour rather than an answer. */}
      {audience === 'head' && hasUnknownOrigin && (
        <p className="text-xs text-muted-foreground">
          Деякі спеціальності у колонці «Бонус» показані сірим: визначити «своя / чужа кафедра» для
          них неможливо.
        </p>
      )}
    </div>
  );
}

function limitsFormData(
  staffId: string,
  departmentId: string,
  year: number,
  next: LimitDraft
): FormData {
  const form = new FormData();
  form.set('staffId', staffId);
  // WHICH кафедра's bounds these are. Bounds are per-кафедра since 2026-08-24
  // and a сумісник's row is on a кафедра that is not their own, so the server
  // cannot derive it — without this every cap edit is «Невірні дані».
  form.set('departmentId', departmentId);
  form.set('year', String(year));
  form.set('min', next.min);
  form.set('max', next.max);
  return form;
}

/**
 * The totals — and there is deliberately no «разом» among them.
 *
 * `Кст` bounds the pool share and nothing else, and the recruitment figure is
 * not part of this phase at all: it is settled months later, when the проректор
 * raises the pool and the head hands out the increase by hand (2026-08-17). So
 * the two never add up here. A «Разом до виплати» tile existed until then and
 * asserted a payment nobody had decided.
 */
/**
 * The two funds as two cards, and what is left of them as a third.
 *
 * The owner's layout (2026-08-17): each fund shows its own size with its own
 * leftover underneath, and the third card adds the two leftovers together and
 * shows the addition rather than only the sum. A проректор asking «скільки ще
 * можна дати» gets the answer without doing arithmetic, and can still see which
 * pool the room is in.
 *
 * **How spending is attributed.** A person has one ставка, not two, so the app
 * cannot know which pool a given 0,05 came from. The rule is: the main fund
 * fills first, and only what exceeds it comes out of the bonus pool. It is the
 * only rule that needs no extra column and no extra decision from the head —
 * and it makes «залишок» on the first card mean «ще не роздано за рейтингом»,
 * which is what it is for. If the two ever need to be spent independently, the
 * grid needs a second editable column per person, not a different sum here.
 *
 * **The bonus fund can never be overdrawn** (owner, 2026-08-25). The bonus fund
 * COMPENSATES the main one, never the other way round: it covers what the main
 * fund could not, and once it is empty there is nothing more it can cover. An
 * excess past both funds therefore lands on the MAIN card, which is where the
 * spending actually happened.
 *
 * The bug this replaced: `Кст` 1,10, bonus fund 0,00, 1,30 handed out, and the
 * cards read «Бонусний фонд 0,00 · залишок −0,20» — a fund that holds nothing
 * reported as overspent, while the main fund it was covering for showed a tidy
 * 0,00. The head could not act on either number.
 */
function Totals({
  kst,
  bonusPool,
  distributed,
  overspent,
  remainingNote,
  bonusEarned,
  formulaTotal,
  actions,
  filled,
}: {
  kst: number | null;
  /** The second pool, or null until the проректор allocates it */
  bonusPool: number | null;
  distributed: number;
  overspent: boolean;
  remainingNote: string | null;
  /** What the кафедра's people earned by recruiting — evidence, never added here */
  bonusEarned: number;
  formulaTotal: number;
  /** «Повернути до формули» and the autosave status, when this viewer may edit */
  actions: React.ReactNode;
  filled: string | null;
}) {
  const base = kst ?? 0;
  const bonus = bonusPool ?? 0;
  // Shared with «Усі кафедри» so the two screens cannot drift — this same
  // arithmetic was written out by hand in both and was wrong in both.
  const split = fundSplit(base, bonus, distributed);
  // `over` lands on the main card: this page has no «Перевитрачено» box to put
  // it in, and the main fund is where the spending was.
  const leftBase = base - split.fromBase - split.over;
  const leftBonus = bonus - split.fromBonus;
  // Still `base + bonus - distributed`, so this card and the «Залишок» column on
  // «Усі кафедри» keep reporting the same number for the same кафедра.
  const leftTotal = leftBase + leftBonus;

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-stretch gap-3 px-5 py-4">
        <PoolCard
          label="Основний фонд"
          term="kst"
          value={kst === null ? '—' : formatStake(kst)}
          note={kst === null ? 'не задано' : `залишок ${formatStake(leftBase)}`}
          noteTone={kst !== null && leftBase < 0 ? 'bad' : undefined}
        />
        <PoolCard
          label="Бонусний фонд"
          term="bonusPool"
          value={bonusPool === null ? '—' : formatStake(bonusPool)}
          note={bonusPool === null ? 'не задано' : `залишок ${formatStake(leftBonus)}`}
        />
        {/* The addition is kept visible under the sum. «7,50» alone is a number
            somebody has to trust; «6,25 + 1,25» is one they can check. */}
        <PoolCard
          label="Залишок"
          term="remaining"
          value={kst === null ? '—' : formatStake(leftTotal)}
          // Named, not just added. «0,00 + 1,00» made the reader work out which
          // half was which from the two cards to its left; saying it costs one
          // wrapped line and removes the guess.
          note={
            kst === null
              ? undefined
              : `основний ${formatStake(leftBase)} + бонусний ${formatStake(leftBonus)}`
          }
          tone={overspent ? 'bad' : 'good'}
        />

        <div className="ml-auto flex flex-col justify-center gap-1 text-right text-xs text-muted-foreground">
          <span>Розподілено: {formatStake(distributed)}</span>
          <span className="inline-flex items-center justify-end gap-1">
            Формула пропонує: {formatStake(formulaTotal)}
            <StakeTermHint term="formulaTotal" />
          </span>
          <span className="inline-flex items-center justify-end gap-1">
            Зароблено за здобувачів: {formatBonus(bonusEarned)}
            <StakeTermHint term="bonus" />
          </span>
        </div>
      </div>

      {remainingNote && (
        <p className="border-t border-amber-600/30 bg-amber-600/5 px-5 py-2 text-xs text-amber-700 dark:text-amber-500">
          {remainingNote}
        </p>
      )}

      {(actions || filled) && (
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-2.5">
          {actions}
          {filled && <span className="ml-auto text-xs text-muted-foreground">{filled}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * One pool as a card: its name, its size, and what is left of it.
 *
 * A bordered box rather than a bare figure (owner's layout, 2026-08-17). Three
 * numbers that mean different things sat in one row of the old design and read
 * as one series; boxing each keeps «виділено» and «залишок» visibly paired, and
 * the leftover is the number a проректор is actually looking for.
 */
function PoolCard({
  label,
  value,
  term,
  note,
  noteTone,
  tone,
}: {
  label: string;
  value: string;
  term?: StakeTerm;
  note?: string;
  noteTone?: 'bad';
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="min-w-40 rounded-lg border px-4 py-3">
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {term && <StakeTermHint term={term} />}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'bad' && 'text-destructive',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-400'
        )}
      >
        {value}
      </p>
      {note && (
        <p
          className={cn(
            'mt-0.5 text-xs tabular-nums',
            noteTone === 'bad' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * One bound — either the floor or the ceiling — for one person. ADMIN or the
 * кафедра's own head — see `canEditLimits`.
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
  //
  // KNOWN, DEFERRED (owner, 2026-08-24): this commits on EVERY press, so
  // raising a ceiling from 0,25 to 0,50 leaves five rows in the журнал аудиту
  // instead of one. Not wrong — each row records a real save — just noisy. The
  // fix is to debounce ~800ms after the last press so a burst becomes one save.
  // The text input below is fine (it commits on blur), and so is the ставка
  // stepper (it only moves local state). See «Known and deliberately deferred»
  // in docs/work-remaining.md before changing this.
  function step(next: number) {
    const text = formatStake(next);
    onChange(text);
    onCommit({ ...draft, [bound]: text });
  }

  return (
    <td className="border border-border px-2 py-2">
      <div className="flex items-center justify-end gap-1">
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
  distributionBlocked,
  headroom,
  overspent,
  statusValues,
  limits,
  limitError,
  limitsPending,
  onChange,
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
  /** No Кст — the ставка field cannot be saved, though the limits still can */
  distributionBlocked: boolean;
  /** What is left of both funds, never below zero — bounds the ▲ */
  headroom: number;
  /** The кафедра is over both funds, which lifts «тільки збільшити» */
  overspent: boolean;
  statusValues: Record<AdminPosition, number | undefined>;
  limits: LimitDraft;
  limitError: string | null;
  limitsPending: boolean;
  onChange: (next: number) => void;
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

  const lower = lowerBound(row);
  const upper = upperBound(row);
  // A saved allocation can fall outside its bounds without anybody touching it
  // — a cap is lowered under a number that was already agreed. The save refuses
  // it, so say so on the field instead of only at the moment of saving. Since
  // 2026-08-26 the head can move the cap back themselves, so this is a warning
  // and no longer a dead end.
  //
  // **Not while there is no `Кст`** (2026-08-17). With no pool the formula
  // proposes 0 for everybody — `formulaShares` skips the floor entirely when
  // `kstHundredths` is 0, because a кафедра nobody has funded is not handing out
  // 0,1 apiece on the strength of it. The field check did not know that rule, so
  // every row rendered red for being under a minimum the formula had deliberately
  // not applied. Six errors nobody on the кафедра can clear: the fix is an ADMIN
  // typing a Кст, which the toolbar now says instead.
  const noPool = view.kstHundredths === null;
  const outOfRange = !noPool && (value < lower || value > upper);
  // Lifted while the кафедра is over its funds — otherwise the only way out of
  // an overspend would be the one move the head is not allowed to make.
  const stakeFloor = overspent ? lower : Math.max(lower, row.formulaHundredths);
  // The ▲ stops at the person's Макс or at what the funds still hold, whichever
  // comes first, so a head cannot walk «нерозподілено» negative one click at a
  // time. `atMax` greys the button out exactly there — the same way «тільки
  // збільшити» is stated by the ▼ rather than by an error message.
  const ceiling = stakeCeiling(value, {
    rating: row.rating,
    minHundredths: row.minHundredths,
    maxHundredths: row.maxHundredths,
    formulaHundredths: row.formulaHundredths,
    headroom,
    overspent,
  });

  // Built on «за формулою», never on `value`: a target that moved every time
  // the head typed would be a target they were chasing rather than aiming at.
  const statusMap = new Map(
    Object.entries(statusValues)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k as AdminPosition, v as number])
  );
  const recommended = recommendedStake({
    formulaHundredths: row.formulaHundredths,
    studentBonus: row.bonus.total,
    status: statusValue(row.adminPosition, statusMap),
  });

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
        {/* Their кафедра is elsewhere and this one also pays them (2026-08-24).
            A muted pill rather than a coloured row: hue is for a chart series
            or a small state indicator, and «works here part-time» is neither an
            error nor a warning. Their bounds and their sort differ; nothing
            else about the row does. */}
        {row.isPartTime && (
          <span
            className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500"
            title="Основна кафедра цієї людини — інша. Тут вона працює за сумісництвом, і ця кафедра теж призначає їй ставку."
          >
            Сумісник
          </span>
        )}
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

      {/* The stored score, not a rounded one. A завідувач reads this column
          beside the university's own «Облік ставок кафедри», which prints
          5629.57 where we printed 5630 — close enough to look like the same
          figure and different enough to make somebody doubt the ставка next to
          it. `round2` only strips float dust; the value is already 2-decimal
          in RatingEntry, and /profile has always shown it unrounded. */}
      <td
        className="border border-border px-3 py-2 text-right text-muted-foreground tabular-nums"
        title={`${row.rating} балів`}
      >
        {round2(row.rating)}
      </td>

      <td className="border border-border px-2 py-2 text-right text-xs tabular-nums">
        <BonusCell bonus={row.bonus} audience={audience} />
      </td>

      <td className="border border-border px-2 py-2 text-right text-xs">
        <StatusCell position={row.adminPosition} values={statusValues} />
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

      <td className="border border-border px-2 py-2 text-right tabular-nums">
        {/* `row.clampedTo` is deliberately NOT drawn here (owner, 2026-08-25).
            A bare ↑ or ↓ beside the number said nothing a head could act on —
            the Мін/Макс that caused it are two columns to the left and already
            on screen. The flag itself stays on the formula result, which is
            tested and read elsewhere. */}
        {formatStake(row.formulaHundredths)}
      </td>

      <td className="border border-border px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <Input
            value={draft ?? formatStake(value)}
            onChange={(e) => setDraft(e.target.value)}
            // `commit` writes through `onChange`, which now saves by itself.
            // There used to be a second `onBlur` call here that saved the whole
            // grid again from state that had not been applied yet.
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={!canEdit || disabled || distributionBlocked}
            inputMode="decimal"
            aria-label={`Ставка для ${row.name}`}
            aria-invalid={outOfRange}
            title={
              outOfRange ? `Поза межами ${formatStake(lower)} – ${formatStake(upper)}` : undefined
            }
            className={cn(
              'h-8 w-16 text-right tabular-nums',
              differs && 'font-medium',
              outOfRange && 'border-destructive text-destructive'
            )}
          />
          <StakeStepper
            value={value}
            onChange={onChange}
            disabled={!canEdit || disabled || distributionBlocked}
            // The formula is the floor, not the person's Мін — «тільки
            // збільшити». `atMin` on the stepper then greys ▼ out exactly where
            // the rule bites, which is why the rule needs no error message.
            min={stakeFloor}
            max={ceiling}
            step={STAKE_STEP}
            label={`ставку для ${row.name}`}
          />
        </div>
      </td>

      {/* «за формулою + здобувачі + посада» — what the objective figures say
          this person earned. It may exceed Макс, and when it does the row says
          so rather than quietly showing the ceiling: that gap is exactly what a
          завідувач takes to the проректор. Nothing is applied from it. */}
      <td className="border border-border px-3 py-2 text-right font-medium tabular-nums">
        <span
          className={cn(
            recommended > fromHundredths(row.maxHundredths) && 'text-amber-700 dark:text-amber-500'
          )}
        >
          {formatStakeValue(recommended)}
        </span>
        {recommended > fromHundredths(row.maxHundredths) && (
          <span
            className="block text-[10px] font-normal text-muted-foreground"
            title={`Понад Макс ${formatStake(row.maxHundredths)} — щоб дати більше, потрібно підняти межу`}
          >
            понад Макс
          </span>
        )}
      </td>
    </tr>
  );
}
