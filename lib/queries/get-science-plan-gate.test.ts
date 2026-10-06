import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { sciencePlan: { findMany: vi.fn() } } }));
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));
vi.mock('@/lib/queries/get-science-plan', () => ({ planDepartmentsFor: vi.fn() }));

import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { planDepartmentsFor } from '@/lib/queries/get-science-plan';
import { getSciencePlanGate } from './get-science-plan-gate';

const findPlans = db.sciencePlan.findMany as unknown as Mock;
const template = getActiveScienceTemplate as unknown as Mock;
const departments = planDepartmentsFor as unknown as Mock;

const HISTORY = { id: 'd1', name: 'Історії' };
const ECONOMY = { id: 'd2', name: 'Економіки' };

beforeEach(() => {
  vi.clearAllMocks();
  template.mockResolvedValue({ id: 't1', stakeYear: 2026 });
  departments.mockResolvedValue([ECONOMY, HISTORY]);
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

    await expect(getSciencePlanGate('s1')).resolves.toEqual({ open: false, unsaved: [ECONOMY] });
  });

  it('opens the rating without touching plans when no science year is open', async () => {
    template.mockResolvedValue(null);

    await expect(getSciencePlanGate('s1')).resolves.toEqual({ open: true });
    expect(findPlans).not.toHaveBeenCalled();
  });
});
