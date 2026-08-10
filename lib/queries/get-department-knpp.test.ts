import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findMany: vi.fn() } } }));
vi.mock('./get-kharakterystyka', () => ({ getKharakterystykaMany: vi.fn() }));

import { db } from '@/lib/db';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { getDepartmentKnpp, getDepartmentsKnpp, minimumKst } from './get-department-knpp';

const mockStaff = db.staff.findMany as unknown as Mock;
const mockDocuments = getKharakterystykaMany as unknown as Mock;

/** `metCount` is all these tests need off a Характеристика */
function documents(byId: Record<string, number>) {
  mockDocuments.mockResolvedValue(
    new Map(Object.entries(byId).map(([id, metCount]) => [id, { metCount }]))
  );
}

function staffRows(rows: { id: string; departmentId: string }[]) {
  mockStaff.mockResolvedValue(
    rows.map((r) => ({ ...r, lastName: r.id, firstName: 'І', patronymic: 'П' }))
  );
}

beforeEach(() => vi.clearAllMocks());

describe('getDepartmentKnpp', () => {
  it('counts only those meeting four of twenty', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'b', departmentId: 'd1' },
      { id: 'c', departmentId: 'd1' },
    ]);
    documents({ a: 7, b: 4, c: 3 });

    const result = await getDepartmentKnpp('d1', 2026);
    expect(result.knpp).toBe(2);
  });

  it('counts everybody in headcount, including those below the bar', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'b', departmentId: 'd1' },
      { id: 'c', departmentId: 'd1' },
    ]);
    documents({ a: 7, b: 4, c: 0 });

    const result = await getDepartmentKnpp('d1', 2026);
    // The two are different numbers on purpose: knpp is a divisor inside the
    // formula, headcount is the bound on the pool. Everyone gets a ставка.
    expect(result).toMatchObject({ knpp: 2, headcount: 3 });
  });

  it('treats exactly four as qualifying and three as not', async () => {
    staffRows([
      { id: 'four', departmentId: 'd1' },
      { id: 'three', departmentId: 'd1' },
    ]);
    documents({ four: 4, three: 3 });

    const result = await getDepartmentKnpp('d1', 2026);
    expect(result.staff.find((s) => s.id === 'four')?.qualifies).toBe(true);
    expect(result.staff.find((s) => s.id === 'three')?.qualifies).toBe(false);
  });

  it('counts somebody with no document at all as zero rather than dropping them', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'missing', departmentId: 'd1' },
    ]);
    documents({ a: 9 });

    const result = await getDepartmentKnpp('d1', 2026);
    // Silently dropping them would understate the headcount, which sets the
    // minimum pool — and they still receive a ставка.
    expect(result.headcount).toBe(2);
    expect(result.knpp).toBe(1);
    expect(result.staff.find((s) => s.id === 'missing')?.metCount).toBe(0);
  });

  it('returns an empty кафедра rather than throwing', async () => {
    staffRows([]);
    documents({});
    expect(await getDepartmentKnpp('empty', 2026)).toMatchObject({ knpp: 0, headcount: 0 });
  });
});

describe('getDepartmentsKnpp', () => {
  it('keeps each кафедра’s people apart', async () => {
    staffRows([
      { id: 'a', departmentId: 'd1' },
      { id: 'b', departmentId: 'd2' },
      { id: 'c', departmentId: 'd2' },
    ]);
    documents({ a: 5, b: 5, c: 1 });

    const result = await getDepartmentsKnpp(['d1', 'd2'], 2026);
    expect(result.find((r) => r.departmentId === 'd1')).toMatchObject({ knpp: 1, headcount: 1 });
    expect(result.find((r) => r.departmentId === 'd2')).toMatchObject({ knpp: 1, headcount: 2 });
  });

  it('returns a row for a кафедра with nobody on it', async () => {
    staffRows([{ id: 'a', departmentId: 'd1' }]);
    documents({ a: 9 });

    const result = await getDepartmentsKnpp(['d1', 'empty'], 2026);
    // A кафедра missing from the output would read as «not measured» on a
    // screen where it means «pool minimum is zero»
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.departmentId === 'empty')).toMatchObject({
      knpp: 0,
      headcount: 0,
    });
  });

  it('does not query at all for an empty list', async () => {
    expect(await getDepartmentsKnpp([], 2026)).toEqual([]);
    expect(mockStaff).not.toHaveBeenCalled();
  });

  it('reads the whole set in one staff query', async () => {
    staffRows([{ id: 'a', departmentId: 'd1' }]);
    documents({ a: 4 });
    await getDepartmentsKnpp(['d1', 'd2', 'd3'], 2026);
    expect(mockStaff).toHaveBeenCalledTimes(1);
    expect(mockDocuments).toHaveBeenCalledTimes(1);
  });

  it('excludes archived staff and non-НПП from the count', async () => {
    staffRows([{ id: 'a', departmentId: 'd1' }]);
    documents({ a: 4 });
    await getDepartmentsKnpp(['d1'], 2026);

    const where = mockStaff.mock.calls[0][0].where;
    expect(where).toMatchObject({ archivedAt: null, isNpp: true });
  });
});

describe('minimumKst', () => {
  it('is 0.1 per person on the roster', () => {
    expect(minimumKst(10)).toBe(1);
    expect(minimumKst(25)).toBe(2.5);
    expect(minimumKst(0)).toBe(0);
  });

  it('does not drift on a count that lands off a round number', () => {
    // 7 × 0.1 in floats is 0.7000000000000001
    expect(minimumKst(7)).toBe(0.7);
    expect(minimumKst(29)).toBe(2.9);
  });
});
