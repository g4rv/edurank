import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    specialityDepartment: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { getSpecialityOwners } from './get-speciality-departments';

const mockLinks = db.specialityDepartment.findMany as unknown as Mock;
const mockDepartments = db.department.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockDepartments.mockResolvedValue([]);
});

describe('getSpecialityOwners', () => {
  it('groups the rows by спеціальність name', async () => {
    mockLinks.mockResolvedValue([
      { departmentId: 'dep-psy', speciality: { name: 'Психологія' } },
      { departmentId: 'dep-practical-psy', speciality: { name: 'Психологія' } },
      { departmentId: 'dep-econ', speciality: { name: 'Економіка' } },
    ]);

    const owners = await getSpecialityOwners();

    expect(owners.get('Психологія')).toEqual(['dep-psy', 'dep-practical-psy']);
    expect(owners.get('Економіка')).toEqual(['dep-econ']);
  });

  // The safety net. Until the backfill of Task 4 has run on a database, the
  // table is empty and production must behave exactly as it does today.
  it('falls back to the constant, matched by name, when the table is empty', async () => {
    mockLinks.mockResolvedValue([]);
    mockDepartments.mockResolvedValue([
      { id: 'dep-econ', name: 'Кафедра економіки' },
      { id: 'dep-unrelated', name: 'Кафедра нової історії' },
    ]);

    const owners = await getSpecialityOwners();

    expect(owners.get('Економіка')).toEqual(['dep-econ']);
  });

  // One row is enough to mean «somebody has started filling this in». Mixing
  // the two sources would hide a half-finished backfill behind old guesses.
  it('does NOT fall back when the table has even one row', async () => {
    mockLinks.mockResolvedValue([{ departmentId: 'dep-econ', speciality: { name: 'Економіка' } }]);

    const owners = await getSpecialityOwners();

    expect(owners.get('Психологія')).toBeUndefined();
    expect(mockDepartments).not.toHaveBeenCalled();
  });

  it('is an empty map when the table is empty and no кафедра name matches', async () => {
    mockLinks.mockResolvedValue([]);
    mockDepartments.mockResolvedValue([{ id: 'dep-x', name: 'Кафедра чогось нового' }]);

    const owners = await getSpecialityOwners();

    expect(owners.size).toBe(0);
  });
});
