import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findUnique: vi.fn() }, stakeAllocation: { findMany: vi.fn() } },
}));
vi.mock('./get-active-template', () => ({ activeYear: vi.fn() }));

import { db } from '@/lib/db';
import { activeYear } from './get-active-template';
import { getStakeBreakdown } from './get-stake-breakdown';

const mockYear = activeYear as unknown as Mock;
const mockPerson = db.staff.findUnique as unknown as Mock;
const mockAllocations = db.stakeAllocation.findMany as unknown as Mock;

function allocations(rows: { id: string; name: string; hundredths: number }[]) {
  mockAllocations.mockResolvedValue(
    rows.map((r) => ({
      proposedHundredths: r.hundredths,
      distribution: { department: { id: r.id, name: r.name } },
    }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockYear.mockResolvedValue(2026);
  mockPerson.mockResolvedValue({ departmentId: 'd1' });
});

describe('getStakeBreakdown', () => {
  it('names one кафедра when the person holds one post', async () => {
    allocations([{ id: 'd1', name: 'Кафедра ботаніки', hundredths: 90 }]);

    expect(await getStakeBreakdown('s1')).toEqual([
      { departmentId: 'd1', department: 'Кафедра ботаніки', hundredths: 90 },
    ]);
  });

  it('names both when they are a сумісник, primary кафедра first', async () => {
    // Arriving additional-first, to prove the sort does the work.
    allocations([
      { id: 'd2', name: 'Кафедра екології', hundredths: 25 },
      { id: 'd1', name: 'Кафедра ботаніки', hundredths: 90 },
    ]);

    const parts = await getStakeBreakdown('s1');
    expect(parts.map((p) => p.department)).toEqual(['Кафедра ботаніки', 'Кафедра екології']);
    expect(parts.reduce((sum, p) => sum + p.hundredths, 0)).toBe(115);
  });

  it('is empty when no head has filled a grid yet', async () => {
    allocations([]);
    // The component renders no note rather than «0,00»: a кафедра nobody has
    // spread yet is not a кафедра paying zero.
    expect(await getStakeBreakdown('s1')).toEqual([]);
  });

  it('is empty when there is no active year at all', async () => {
    mockYear.mockResolvedValue(null);
    expect(await getStakeBreakdown('s1')).toEqual([]);
    expect(mockAllocations).not.toHaveBeenCalled();
  });

  it('reads only the active year', async () => {
    allocations([]);
    await getStakeBreakdown('s1');
    expect(mockAllocations.mock.calls[0][0].where).toEqual({
      staffId: 's1',
      distribution: { year: 2026 },
    });
  });
});
