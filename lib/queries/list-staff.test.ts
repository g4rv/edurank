import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findMany: vi.fn() } } }));

import { db } from '@/lib/db';
import { listStaff } from './list-staff';

const mockStaff = db.staff.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockStaff.mockResolvedValue([]);
});

const conditions = () => mockStaff.mock.calls[0][0].where.AND as object[];

describe('filtering by кафедра', () => {
  it('finds сумісники as well as the кафедра’s own staff', async () => {
    await listStaff({ departmentId: 'd1' });

    expect(conditions()).toContainEqual({
      OR: [{ departmentId: 'd1' }, { partTimeDepartments: { some: { departmentId: 'd1' } } }],
    });
  });

  it('returns each person once, however many кафедри they hold', async () => {
    // A `some` filter selects people, it does not multiply them — so this stays
    // a filter and must never become a join over StaffDepartment.
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Гість',
        firstName: 'І',
        patronymic: 'П',
        email: 'g@u.ua',
        isNpp: true,
        archivedAt: null,
        academicRank: null,
        scientificDegree: null,
        department: { name: 'Кафедра ботаніки' },
        division: null,
        partTimeDepartments: [{ department: { name: 'Кафедра екології' } }],
      },
    ]);

    const rows = await listStaff({ departmentId: 'd1' });
    expect(rows).toHaveLength(1);
  });

  it('carries the additional кафедра’s name so the cell can show it', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Гість',
        firstName: 'І',
        patronymic: 'П',
        email: 'g@u.ua',
        isNpp: true,
        archivedAt: null,
        academicRank: null,
        scientificDegree: null,
        department: { name: 'Кафедра ботаніки' },
        division: null,
        partTimeDepartments: [{ department: { name: 'Кафедра екології' } }],
      },
    ]);

    const [row] = await listStaff();
    expect(row.partTimeDepartments).toEqual([{ department: { name: 'Кафедра екології' } }]);
  });

  it('still keeps archived people out by default', async () => {
    await listStaff({ departmentId: 'd1' });
    expect(conditions()).toContainEqual({ archivedAt: null, isSystem: false });
  });
});
