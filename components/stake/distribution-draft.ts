/**
 * The ставка grid's unsaved work, as one value.
 *
 * WHY THIS IS NOT THREE `useState` CALLS. It was, and the three had to agree:
 * what is on screen, what the server is known to hold, and which rows have been
 * written this session. «Unsaved changes» is a question about all three at once,
 * and every bug the grid has had was that question answered wrongly:
 *
 * - a сумісник added to an already-spread кафедра matched `savedValues` by
 *   construction, so «Зберегти» sat greyed out on the one case it existed for
 *   (2026-08-24);
 * - a save wrote two `setState` calls that had to land together to stop the
 *   toolbar reading «Незбережені зміни» forever after a successful write.
 *
 * Neither could be tested. A component's `useState` is reachable only by
 * rendering it and clicking, so the rule that actually decides whether anybody's
 * work can be saved had no test at all — while `settleStake` beside it, a
 * simpler rule, has fifteen.
 *
 * So the state moves out here as a plain reducer and `isDirty` becomes a pure
 * function of it. The grid keeps the same behaviour and the rule becomes
 * something a test can ask questions of directly.
 */

/** What the reducer needs to know about a row. The grid's `StakeRow` satisfies it. */
export interface DraftRow {
  staffId: string;
  /** Is there a stored `StakeAllocation`, or is the number only the формула's proposal? */
  hasAllocation: boolean;
}

export interface DraftState {
  /** What is on screen right now */
  values: Record<string, number>;
  /**
   * What the server is known to hold.
   *
   * Compared against this rather than against the props: a save does not refetch
   * the route, so `view.rows[].proposedHundredths` keeps the pre-save numbers
   * and the toolbar would read «Незбережені зміни» forever after a write.
   */
  savedValues: Record<string, number>;
  /**
   * Who has been written THIS session.
   *
   * Needed for the same reason: the props go on saying `hasAllocation: false`
   * for a brand-new row until the route is refetched, so without this a row
   * that has just been stored still counts as unsaved work.
   */
  savedRows: ReadonlySet<string>;
}

export type DraftAction =
  /** One person's ставка moved on screen. Nothing is written. */
  | { type: 'set'; staffId: string; hundredths: number }
  /** Back to «за формулою» for everybody — on screen only. */
  | { type: 'reset'; values: Record<string, number> }
  /** A save came back successful: these values, for these people, are now on the server. */
  | { type: 'saved'; values: Record<string, number>; staffIds: readonly string[] };

/** The opening state: nothing typed, nothing written this session. */
export function initialDraft(values: Record<string, number>): DraftState {
  return { values, savedValues: values, savedRows: new Set() };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'set':
      return {
        ...state,
        values: { ...state.values, [action.staffId]: action.hundredths },
      };

    case 'reset':
      // `savedValues` and `savedRows` are untouched on purpose: resetting the
      // screen to the формула does not unwrite anything, and a reset back onto
      // the stored numbers must leave «Зберегти» disabled rather than pretending
      // there is work to do.
      return { ...state, values: action.values };

    case 'saved':
      // The two writes that used to be separate `setState` calls, now one
      // transition. React batched them in practice; making it a single value
      // means it is not a thing that CAN come apart, which is a different and
      // better guarantee than «has not so far».
      return {
        values: state.values,
        savedValues: action.values,
        savedRows: new Set([...state.savedRows, ...action.staffIds]),
      };
  }
}

/**
 * Is there anything «Зберегти» would actually store?
 *
 * TWO conditions, and the second one is the one that keeps being forgotten:
 *
 * 1. somebody typed, stepped or reset a value away from what the server holds;
 * 2. **some row has never been stored at all** — a сумісник кадри added after
 *    this кафедра was spread, or a new colleague. Their on-screen number is the
 *    формула's proposal and it equals `savedValues` by construction, so
 *    condition 1 is false for them and the button would be disabled on exactly
 *    the case it is needed for (2026-08-24).
 *
 * `savedRows` is what stops condition 2 being permanently true: once a save has
 * stored that person, they stop counting even though the props still say
 * `hasAllocation: false` until the route is refetched.
 */
export function isDirty(state: DraftState, rows: readonly DraftRow[]): boolean {
  const neverStored = rows.some((r) => !r.hasAllocation && !state.savedRows.has(r.staffId));
  if (neverStored) return true;
  return rows.some((r) => state.values[r.staffId] !== state.savedValues[r.staffId]);
}

/**
 * The rows that exist on screen with nothing stored behind them.
 *
 * The toolbar names them, so a head is told WHY there is something to save on a
 * кафедра they have not touched — «Зберегти» lighting up on its own is
 * otherwise indistinguishable from a bug.
 */
export function neverStoredRows<T extends DraftRow>(state: DraftState, rows: readonly T[]): T[] {
  return rows.filter((r) => !r.hasAllocation && !state.savedRows.has(r.staffId));
}
