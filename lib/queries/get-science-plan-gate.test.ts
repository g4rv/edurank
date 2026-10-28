import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { sciencePlan: { findMany: vi.fn() }, stakeAllocation: { findMany: vi.fn() } },
}));
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));
vi.mock('@/lib/queries/get-science-plan', () => ({ planDepartmentsFor: vi.fn() }));

import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { planDepartmentsFor } from '@/lib/queries/get-science-plan';
import { getSciencePlanGate } from './get-science-plan-gate';

const findPlans = db.sciencePlan.findMany as unknown as Mock;
const findRates = db.stakeAllocation.findMany as unknown as Mock;
const template = getActiveScienceTemplate as unknown as Mock;
const departments = planDepartmentsFor as unknown as Mock;

const HISTORY = { id: 'd1', name: 'Історії' };
const ECONOMY = { id: 'd2', name: 'Економіки' };

beforeEach(() => {
  vi.clearAllMocks();
  template.mockResolvedValue({ id: 't1', stakeYear: 2026 });
  departments.mockResolvedValue([ECONOMY, HISTORY]);
  findRates.mockResolvedValue([]);
});

describe('getSciencePlanGate', () => {
  it('reads the plans of the OPEN year only', async () => {
    findPlans.mockResolvedValue([]);

    await getSciencePlanGate('s1');

    expect(findPlans).toHaveBeenCalledWith(
      expect.objectContaining({ where: { staffId: 's1', templateId: 't1' } })
    );
  });

  it('names the кафедри still missing a saved plan', async () => {
    findPlans.mockResolvedValue([{ departmentId: 'd1', lockedAt: new Date() }]);

    findRates.mockResolvedValue([{ distribution: { departmentId: 'd2' } }]);

    await expect(getSciencePlanGate('s1')).resolves.toEqual({
      open: false,
      unsaved: [{ ...ECONOMY, noRate: false }],
    });
  });

  // Кулик, 2026-10-28: main plan saved, no ставка on the second кафедра — she
  // cannot save that plan, and the note has to say whom to ask.
  it('marks a кафедра that has not given the person a ставка', async () => {
    findPlans.mockResolvedValue([{ departmentId: 'd1', lockedAt: new Date() }]);

    await expect(getSciencePlanGate('s1')).resolves.toEqual({
      open: false,
      unsaved: [{ ...ECONOMY, noRate: true }],
    });
    expect(findRates).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId: 's1', distribution: { year: 2026, departmentId: { in: ['d2'] } } },
      })
    );
  });

  it('reads no ставки when every plan is saved', async () => {
    findPlans.mockResolvedValue([
      { departmentId: 'd1', lockedAt: new Date() },
      { departmentId: 'd2', lockedAt: new Date() },
    ]);

    await expect(getSciencePlanGate('s1')).resolves.toEqual({ open: true });
    expect(findRates).not.toHaveBeenCalled();
  });

  it('opens the rating without touching plans when no science year is open', async () => {
    template.mockResolvedValue(null);

    await expect(getSciencePlanGate('s1')).resolves.toEqual({ open: true });
    expect(findPlans).not.toHaveBeenCalled();
  });
});
