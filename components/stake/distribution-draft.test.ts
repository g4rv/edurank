import { describe, expect, it } from 'vitest';
import {
  draftReducer,
  initialDraft,
  isDirty,
  neverStoredRows,
  type DraftRow,
  type DraftState,
} from './distribution-draft';

// Every case below is a bug this grid actually had. They were all reported from
// the screen rather than caught here, because the state they are about lived in
// three `useState` calls inside a 1400-line component and nothing could reach it.

const stored = (staffId: string): DraftRow => ({ staffId, hasAllocation: true });
const fresh = (staffId: string): DraftRow => ({ staffId, hasAllocation: false });

/** A кафедра whose split is fully saved — the ordinary starting point */
function spread(values: Record<string, number>): DraftState {
  return initialDraft(values);
}

describe('initialDraft', () => {
  it('opens with nothing to save', () => {
    const state = spread({ a: 100, b: 50 });
    expect(isDirty(state, [stored('a'), stored('b')])).toBe(false);
  });
});

describe('set', () => {
  it('makes the кафедра dirty', () => {
    const state = draftReducer(spread({ a: 100, b: 50 }), {
      type: 'set',
      staffId: 'a',
      hundredths: 105,
    });
    expect(state.values.a).toBe(105);
    expect(isDirty(state, [stored('a'), stored('b')])).toBe(true);
  });

  it('leaves everybody else alone', () => {
    const state = draftReducer(spread({ a: 100, b: 50 }), {
      type: 'set',
      staffId: 'a',
      hundredths: 105,
    });
    expect(state.values.b).toBe(50);
  });

  it('is clean again when the value is typed back', () => {
    let state = spread({ a: 100 });
    state = draftReducer(state, { type: 'set', staffId: 'a', hundredths: 105 });
    state = draftReducer(state, { type: 'set', staffId: 'a', hundredths: 100 });
    expect(isDirty(state, [stored('a')])).toBe(false);
  });

  it('never writes to savedValues', () => {
    const state = draftReducer(spread({ a: 100 }), {
      type: 'set',
      staffId: 'a',
      hundredths: 105,
    });
    // Nothing reaches the database until «Зберегти» (owner, 2026-08-24).
    expect(state.savedValues.a).toBe(100);
  });
});

describe('reset', () => {
  it('marks work to save when the формула differs from the stored split', () => {
    const state = draftReducer(spread({ a: 100, b: 50 }), {
      type: 'reset',
      values: { a: 80, b: 70 },
    });
    expect(isDirty(state, [stored('a'), stored('b')])).toBe(true);
  });

  it('leaves nothing to save when it lands back on the stored numbers', () => {
    let state = spread({ a: 100, b: 50 });
    state = draftReducer(state, { type: 'set', staffId: 'a', hundredths: 105 });
    state = draftReducer(state, { type: 'reset', values: { a: 100, b: 50 } });
    // A reset onto what is already stored has undone the edit, not created one.
    expect(isDirty(state, [stored('a'), stored('b')])).toBe(false);
  });
});

describe('saved', () => {
  it('clears «Незбережені зміни»', () => {
    let state = spread({ a: 100 });
    state = draftReducer(state, { type: 'set', staffId: 'a', hundredths: 105 });
    state = draftReducer(state, { type: 'saved', values: state.values, staffIds: ['a'] });
    expect(isDirty(state, [stored('a')])).toBe(false);
  });

  it('does not clear an edit made in a different row after the save started', () => {
    let state = spread({ a: 100, b: 50 });
    state = draftReducer(state, { type: 'set', staffId: 'a', hundredths: 105 });
    const sent = state.values;
    // The head keeps typing while the request is in flight.
    state = draftReducer(state, { type: 'set', staffId: 'b', hundredths: 55 });
    state = draftReducer(state, { type: 'saved', values: sent, staffIds: ['a', 'b'] });
    // `b` moved after the payload left, so it is still unsaved work.
    expect(isDirty(state, [stored('a'), stored('b')])).toBe(true);
    expect(state.values.b).toBe(55);
  });
});

/**
 * The 2026-08-24 bug, which is the whole reason this file exists.
 *
 * Кадри tick сумісництво; the кафедра's grid immediately shows the new person
 * on the формула's proposal and «Розподілено» counts it. Nothing is stored for
 * them. `values` and `savedValues` agree by construction — both seeded from the
 * same proposal — so the old «values !== savedValues» test said clean, and
 * «Зберегти» was disabled on the one кафедра that needed pressing.
 */
describe('a row that has never been stored', () => {
  const rows = [stored('a'), fresh('newcomer')];

  it('counts as unsaved work even though nobody typed anything', () => {
    const state = spread({ a: 100, newcomer: 25 });
    expect(isDirty(state, rows)).toBe(true);
  });

  it('is named, so the head is told why there is something to save', () => {
    const state = spread({ a: 100, newcomer: 25 });
    expect(neverStoredRows(state, rows).map((r) => r.staffId)).toEqual(['newcomer']);
  });

  it('stops counting once a save has stored them', () => {
    let state = spread({ a: 100, newcomer: 25 });
    state = draftReducer(state, {
      type: 'saved',
      values: state.values,
      staffIds: ['a', 'newcomer'],
    });
    // The props still say `hasAllocation: false` until the route is refetched —
    // `savedRows` is what keeps the button from re-arming itself forever.
    expect(isDirty(state, rows)).toBe(false);
    expect(neverStoredRows(state, rows)).toEqual([]);
  });

  it('remembers earlier saves when a later one covers different people', () => {
    let state = spread({ a: 100, newcomer: 25 });
    state = draftReducer(state, { type: 'saved', values: state.values, staffIds: ['newcomer'] });
    state = draftReducer(state, { type: 'saved', values: state.values, staffIds: ['a'] });
    expect(state.savedRows.has('newcomer')).toBe(true);
  });
});

describe('an empty кафедра', () => {
  it('has nothing to save', () => {
    expect(isDirty(spread({}), [])).toBe(false);
  });
});
