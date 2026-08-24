import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { department: { findMany: vi.fn() }, staff: { findMany: vi.fn() } },
}));
vi.mock('./scope', () => ({ scopeOf: vi.fn() }));

import { db } from '@/lib/db';
import { scopeOf } from './scope';
import { listMyDepartments } from './list-my-department';

const mockScope = scopeOf as unknown as Mock;
const mockDepartments = db.department.findMany as unknown as Mock;
const mockStaff = db.staff.findMany as unknown as Mock;

/** The кафедри in scope, in the order the query returns them. */
function departments(ids: string[]) {
  mockDepartments.mockResolvedValue(
    ids.map((id) => ({ id, name: `Кафедра ${id}`, faculty: { name: 'Факультет' } }))
  );
}

function staff(
  rows: { id: string; departmentId: string | null; partTimeIn?: string[]; total?: number }[]
) {
  mockStaff.mockResolvedValue(
    rows.map((r) => ({
      id: r.id,
      departmentId: r.departmentId,
      partTimeDepartments: (r.partTimeIn ?? []).map((departmentId) => ({ departmentId })),
      lastName: r.id,
      firstName: 'І',
      patronymic: 'П',
      academicRank: null,
      scientificDegree: null,
      ratingEntries: r.total === undefined ? [] : [{ totalScore: r.total }],
    }))
  );
}

beforeEach(() => vi.clearAllMocks());

describe('listMyDepartments with a сумісник', () => {
  it('shows them to the head of the кафедра they also work for', async () => {
    mockScope.mockResolvedValue(['d1']);
    departments(['d1']);
    staff([{ id: 'guest', departmentId: 'd2', partTimeIn: ['d1'], total: 500 }]);

    const [d1] = await listMyDepartments('head', 2026);
    expect(d1.staff).toHaveLength(1);
    expect(d1.staff[0]).toMatchObject({ id: 'guest', isPartTime: true });
  });

  it('shows the same person to their own head as a primary member', async () => {
    mockScope.mockResolvedValue(['d2']);
    departments(['d2']);
    staff([{ id: 'guest', departmentId: 'd2', partTimeIn: ['d1'], total: 500 }]);

    const [d2] = await listMyDepartments('head', 2026);
    expect(d2.staff[0]).toMatchObject({ id: 'guest', isPartTime: false });
  });

  it('lists a декан’s two кафедри with the same person under each', async () => {
    mockScope.mockResolvedValue(['d1', 'd2']);
    departments(['d1', 'd2']);
    staff([{ id: 'guest', departmentId: 'd2', partTimeIn: ['d1'], total: 500 }]);

    const result = await listMyDepartments('dean', 2026);
    expect(result.find((d) => d.id === 'd1')!.staff.map((s) => s.id)).toEqual(['guest']);
    expect(result.find((d) => d.id === 'd2')!.staff.map((s) => s.id)).toEqual(['guest']);
  });

  it('sorts сумісники last, however high their total', async () => {
    mockScope.mockResolvedValue(['d1']);
    departments(['d1']);
    staff([
      { id: 'guest', departmentId: 'd2', partTimeIn: ['d1'], total: 9000 },
      { id: 'own', departmentId: 'd1', total: 100 },
    ]);

    const [d1] = await listMyDepartments('head', 2026);
    expect(d1.staff.map((s) => s.id)).toEqual(['own', 'guest']);
  });

  it('asks for сумісники as well as primary staff', async () => {
    mockScope.mockResolvedValue(['d1']);
    departments(['d1']);
    staff([]);

    await listMyDepartments('head', 2026);
    expect(mockStaff.mock.calls[0][0].where.OR).toEqual([
      { departmentId: { in: ['d1'] } },
      { partTimeDepartments: { some: { departmentId: { in: ['d1'] } } } },
    ]);
  });

  it('ignores a кафедра outside the head’s scope', async () => {
    mockScope.mockResolvedValue(['d1']);
    departments(['d1']);
    // Their сумісництво on d3 is real but none of this head's business.
    staff([{ id: 'guest', departmentId: 'd2', partTimeIn: ['d1', 'd3'], total: 500 }]);

    const result = await listMyDepartments('head', 2026);
    expect(result).toHaveLength(1);
    expect(result[0].staff).toHaveLength(1);
  });

  it('returns nothing at all for somebody who heads no кафедра', async () => {
    mockScope.mockResolvedValue([]);
    expect(await listMyDepartments('nobody', 2026)).toEqual([]);
    expect(mockStaff).not.toHaveBeenCalled();
  });
});
