import { describe, expect, it } from 'vitest';
import { isShort, matchesState, nextDir, sortPlanRows } from './plan-rows';
import type { SciencePlanRowSummary } from '@/lib/queries/list-science-plans';

function row(over: Partial<SciencePlanRowSummary> = {}): SciencePlanRowSummary {
  return {
    staffId: 's1',
    fullName: 'Іваненко Іван Іванович',
    departmentId: 'd1',
    departmentName: 'Кафедра математики',
    isPartTime: false,
    rateHundredths: 100,
    targetHundredths: 50000,
    plannedHundredths: 0,
    shortfallHundredths: 50000,
    doneHundredths: 0,
    doneShortfallHundredths: 50000,
    hasPlan: false,
    planId: null,
    lockedAt: null,
    ...over,
  };
}

const noRate = row({
  rateHundredths: null,
  targetHundredths: null,
  shortfallHundredths: null,
});

describe('isShort', () => {
  it('is true below the target', () => {
    expect(isShort(row())).toBe(true);
  });

  it('is false once the target is met', () => {
    expect(isShort(row({ plannedHundredths: 50000, shortfallHundredths: 0 }))).toBe(false);
  });

  it('is FALSE with no ставка — nothing to be short of', () => {
    expect(isShort(noRate)).toBe(false);
  });
});

describe('matchesState', () => {
  it('keeps everything when no state is asked for', () => {
    expect(matchesState(noRate, undefined)).toBe(true);
  });

  it('«мають план» reads hasPlan, not the hours', () => {
    // Somebody may legitimately plan rows worth nothing yet and still HAVE a plan.
    expect(matchesState(row({ hasPlan: true }), 'plan')).toBe(true);
    expect(matchesState(row({ hasPlan: false }), 'plan')).toBe(false);
  });

  it('«без ставки» is the null rate, never a zero one', () => {
    expect(matchesState(noRate, 'norate')).toBe(true);
    expect(matchesState(row({ rateHundredths: 0 }), 'norate')).toBe(false);
  });

  it('«нічого не виконано» reads doneHundredths, zero and only zero', () => {
    expect(matchesState(row({ doneHundredths: 0 }), 'nodone')).toBe(true);
    expect(matchesState(row({ doneHundredths: 1 }), 'nodone')).toBe(false);
  });
});

describe('sortPlanRows', () => {
  const a = row({ staffId: 'a', fullName: 'Андрієнко А. А.', shortfallHundredths: 0 });
  const b = row({ staffId: 'b', fullName: 'Іщенко І. І.', shortfallHundredths: 100 });
  const c = row({ staffId: 'c', fullName: 'Єрмак Є. Є.', shortfallHundredths: 200 });

  it('defaults to short-of-target first, then by name', () => {
    const sorted = sortPlanRows([a, b, c], undefined, 'desc');
    expect(sorted.map((r) => r.staffId)).toEqual(['c', 'b', 'a']);
  });

  it('sorts Ukrainian names by the uk collation, not by code point', () => {
    // Є sorts before І in Ukrainian; by code point it does not.
    const sorted = sortPlanRows([b, c], 'name', 'asc');
    expect(sorted.map((r) => r.staffId)).toEqual(['c', 'b']);
  });

  it('puts a null figure LAST in both directions', () => {
    const rows = [noRate, row({ staffId: 'x', targetHundredths: 10000 })];
    for (const dir of ['asc', 'desc'] as const) {
      const sorted = sortPlanRows(rows, 'target', dir);
      expect(sorted[sorted.length - 1].rateHundredths).toBeNull();
    }
  });

  it('does not mutate what it is given', () => {
    const rows = [c, a, b];
    sortPlanRows(rows, 'name', 'asc');
    expect(rows.map((r) => r.staffId)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by виконано', () => {
    const low = row({ staffId: 'low', doneHundredths: 100 });
    const high = row({ staffId: 'high', doneHundredths: 50000 });
    expect(sortPlanRows([low, high], 'done', 'desc').map((r) => r.staffId)).toEqual([
      'high',
      'low',
    ]);
    expect(sortPlanRows([low, high], 'done', 'asc').map((r) => r.staffId)).toEqual(['low', 'high']);
  });
});

describe('nextDir', () => {
  it('opens a figure column largest-first', () => {
    expect(nextDir(undefined, 'desc', 'planned')).toBe('desc');
  });

  it('opens a name column А→Я', () => {
    expect(nextDir(undefined, 'desc', 'name')).toBe('asc');
  });

  it('flips the column already sorted', () => {
    expect(nextDir('planned', 'desc', 'planned')).toBe('asc');
    expect(nextDir('planned', 'asc', 'planned')).toBe('desc');
  });

  it('opens виконано largest-first, like every other figure column', () => {
    expect(nextDir(undefined, 'desc', 'done')).toBe('desc');
  });
});
