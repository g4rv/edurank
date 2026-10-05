import { describe, expect, it } from 'vitest';
import { pickPlanDepartment } from './plan-department';

const ECONOMY = { id: 'd1', name: 'Кафедра економіки' };
const HISTORY = { id: 'd2', name: 'Кафедра історії' };

describe('pickPlanDepartment', () => {
  it('takes the asked кафедра when it is one of theirs', () => {
    expect(pickPlanDepartment('d2', 'd1', [ECONOMY, HISTORY])).toBe('d2');
  });

  // A typed or stale ?dept= must never open somebody else's plan.
  it('ignores an asked кафедра that is not theirs and falls back to the primary', () => {
    expect(pickPlanDepartment('elsewhere', 'd2', [ECONOMY, HISTORY])).toBe('d2');
  });

  it('defaults to the primary кафедра', () => {
    expect(pickPlanDepartment(undefined, 'd2', [ECONOMY, HISTORY])).toBe('d2');
  });

  // A сумісник with no primary has nothing to fall back to but the list itself.
  it('takes the first кафедра when there is no primary', () => {
    expect(pickPlanDepartment(undefined, undefined, [ECONOMY, HISTORY])).toBe('d1');
  });

  it('does not fall back to a primary that is not on the list', () => {
    expect(pickPlanDepartment(undefined, 'gone', [HISTORY])).toBe('d2');
  });
});
