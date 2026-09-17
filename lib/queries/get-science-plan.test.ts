import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    sciencePlanTemplate: { findUnique: vi.fn() },
    sciencePlan: { findUnique: vi.fn() },
    stakeAllocation: { findFirst: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { getSciencePlan } from './get-science-plan';

const mockTemplate = db.sciencePlanTemplate.findUnique as unknown as Mock;
const mockPlan = db.sciencePlan.findUnique as unknown as Mock;
const mockAllocation = db.stakeAllocation.findFirst as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an OPEN template always reads the live розподіл', () => {
  beforeEach(() => {
    mockTemplate.mockResolvedValue({ minHoursPerRate: 500, stakeYear: 2026, status: 'OPEN' });
  });

  it('no plan yet — target still comes from the live allocation', async () => {
    mockPlan.mockResolvedValue(null);
    mockAllocation.mockResolvedValue({ proposedHundredths: 100 });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.plan).toBeNull();
    expect(result.target.rateHundredths).toBe(100);
    expect(result.target.targetHundredths).toBe(50000);
  });

  it('a plan exists but was saved with rateHundredths null — the live allocation still fills the target', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: null, rows: [] });
    mockAllocation.mockResolvedValue({ proposedHundredths: 100 });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.plan).toEqual({ id: 'p1' });
    expect(result.target.rateHundredths).toBe(100);
    expect(result.target.targetHundredths).toBe(50000);
  });

  it('no allocation anywhere — target stays null, the correct «no ставка» case', async () => {
    mockPlan.mockResolvedValue(null);
    mockAllocation.mockResolvedValue(null);

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.rateHundredths).toBeNull();
    expect(result.target.targetHundredths).toBeNull();
  });
});

describe('a CLOSED template keeps the frozen snapshot', () => {
  beforeEach(() => {
    mockTemplate.mockResolvedValue({ minHoursPerRate: 500, stakeYear: 2025, status: 'CLOSED' });
  });

  it('uses the stored plan.rateHundredths and never queries stakeAllocation', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: 100, rows: [] });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.rateHundredths).toBe(100);
    expect(result.target.targetHundredths).toBe(50000);
    expect(mockAllocation).not.toHaveBeenCalled();
  });

  it('no plan at all — target is null, not a live lookup', async () => {
    mockPlan.mockResolvedValue(null);

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.rateHundredths).toBeNull();
    expect(mockAllocation).not.toHaveBeenCalled();
  });
});
