import { describe, expect, it } from 'vitest';
import { planGate } from './plan-gate';

const HISTORY = { id: 'd1', name: 'Історії' };
const ECONOMY = { id: 'd2', name: 'Економіки' };
const SAVED = new Date('2026-09-20T10:00:00Z');

describe('planGate', () => {
  it('opens the rating once the plan of the only кафедра is saved', () => {
    expect(
      planGate({
        hasOpenYear: true,
        departments: [HISTORY],
        plans: [{ departmentId: 'd1', lockedAt: SAVED }],
      })
    ).toEqual({ open: true });
  });

  it('closes it while that plan is still a draft', () => {
    expect(
      planGate({
        hasOpenYear: true,
        departments: [HISTORY],
        plans: [{ departmentId: 'd1', lockedAt: null }],
      })
    ).toEqual({ open: false, unsaved: [HISTORY] });
  });

  // Somebody who never opened /science-plan has no plan row at all — that is
  // the commonest «not saved», not an exception to it.
  it('closes it when no plan exists yet', () => {
    expect(planGate({ hasOpenYear: true, departments: [HISTORY], plans: [] })).toEqual({
      open: false,
      unsaved: [HISTORY],
    });
  });

  // A сумісник is planned on both кафедри, and each expects its own plan.
  it('keeps a сумісник out until EVERY кафедра has a saved plan', () => {
    expect(
      planGate({
        hasOpenYear: true,
        departments: [ECONOMY, HISTORY],
        plans: [
          { departmentId: 'd1', lockedAt: SAVED },
          { departmentId: 'd2', lockedAt: null },
        ],
      })
    ).toEqual({ open: false, unsaved: [ECONOMY] });
  });

  // Between science years nobody can save a plan, so nobody may be held to one.
  it('opens the rating when there is no open science year', () => {
    expect(planGate({ hasOpenYear: false, departments: [HISTORY], plans: [] })).toEqual({
      open: true,
    });
  });
});
