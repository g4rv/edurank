import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findMany: vi.fn() }, ratingTemplate: { findUnique: vi.fn() } },
}));

import { db } from '@/lib/db';
import { listRatings } from './list-ratings';

const mockStaff = db.staff.findMany as unknown as Mock;
const mockTemplate = db.ratingTemplate.findUnique as unknown as Mock;

/** One person, with whatever сумісництво the test needs. */
function people(rows: { id: string; partTimeIn?: string[] }[]) {
  mockStaff.mockResolvedValue(
    rows.map((r) => ({
      id: r.id,
      lastName: r.id,
      firstName: 'І',
      patronymic: 'П',
      department: { name: 'Кафедра ботаніки', faculty: { name: 'Природничий' } },
      partTimeDepartments: (r.partTimeIn ?? []).map((name) => ({ department: { name } })),
      ratingEntries: [],
    }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTemplate.mockResolvedValue({ status: 'ACTIVE' });
  people([]);
});

const conditions = () => mockStaff.mock.calls[0][0].where.AND as object[];

describe('filtering by кафедра', () => {
  it('finds сумісники as well as the кафедра’s own staff', async () => {
    await listRatings({ year: 2026, departmentId: 'd1' });

    expect(conditions()).toContainEqual({
      OR: [{ departmentId: 'd1' }, { partTimeDepartments: { some: { departmentId: 'd1' } } }],
    });
  });

  it('names their additional кафедра on the row', async () => {
    people([{ id: 'guest', partTimeIn: ['Кафедра екології'] }]);

    const [row] = await listRatings({ year: 2026, departmentId: 'd1' });
    expect(row.partTimeDepartments).toEqual(['Кафедра екології']);
  });

  it('leaves the unfiltered university ranking one row per person', async () => {
    people([{ id: 'own' }, { id: 'guest', partTimeIn: ['Кафедра екології'] }]);

    // Listing somebody twice would break the ranking, which is the whole point
    // of the page. A `some` filter selects people, it does not multiply them.
    expect(await listRatings({ year: 2026 })).toHaveLength(2);
  });

  it('gives somebody with no сумісництво an empty list, not undefined', async () => {
    people([{ id: 'own' }]);

    const [row] = await listRatings({ year: 2026 });
    expect(row.partTimeDepartments).toEqual([]);
  });
});
