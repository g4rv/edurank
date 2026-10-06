import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findMany: vi.fn() } } }));

import { db } from '@/lib/db';
import { adminPositionCondition, degreeCondition, listStaff } from './list-staff';

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
        position: null,
        academicTitle: null,
        candidateDegree: null,
        doctorDegree: null,
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
        position: null,
        academicTitle: null,
        candidateDegree: null,
        doctorDegree: null,
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

// «Хто ще не увійшов» — the question the invite batch keeps raising, asked
// against the list where something can be done about it. Derived from
// `passwordHash`, so this is also the guard that the hash itself never leaves.
describe('filtering by activation', () => {
  it('asks for people who have set a password', async () => {
    await listStaff({ activated: true });
    expect(conditions()).toContainEqual({ passwordHash: { not: null } });
  });

  it('asks for people who never have', async () => {
    await listStaff({ activated: false });
    expect(conditions()).toContainEqual({ passwordHash: null });
  });

  // `false` is a filter, `undefined` is «всі» — the distinction the page's
  // ?activated= parsing rests on, and the one a truthiness check would lose.
  it('does not filter at all when unset', async () => {
    await listStaff({});
    for (const c of conditions()) {
      expect(Object.keys(c)).not.toContain('passwordHash');
    }
  });

  it('never lets the hash out, whichever way it filtered', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Гість',
        firstName: 'І',
        patronymic: 'П',
        email: 'g@u.ua',
        isNpp: true,
        archivedAt: null,
        position: null,
        academicTitle: null,
        candidateDegree: null,
        doctorDegree: null,
        passwordHash: '$2b$10$secret',
        department: null,
        division: null,
        partTimeDepartments: [],
      },
    ]);

    const rows = await listStaff({ activated: true, includeAccount: true });
    expect(rows[0]).not.toHaveProperty('passwordHash');
    expect(rows[0].isActivated).toBe(true);
  });
});

// The academic filters on the new fields (owner, 2026-10-06)
describe('degreeCondition', () => {
  it('finds anybody holding a degree of the level', () => {
    expect(degreeCondition('CANDIDATE')).toEqual({ candidateDegree: { not: null } });
    expect(degreeCondition('DOCTOR')).toEqual({ doctorDegree: { not: null } });
  });

  it('finds one exact degree in its own slot', () => {
    expect(degreeCondition('cand_pedagogy')).toEqual({ candidateDegree: 'cand_pedagogy' });
    expect(degreeCondition('phd')).toEqual({ candidateDegree: 'phd' });
    expect(degreeCondition('doc_history')).toEqual({ doctorDegree: 'doc_history' });
  });
});

describe('adminPositionCondition', () => {
  // Naming somebody декан or завідувач is what makes them one — nobody picks it
  it('finds a декан and a завідувач by the факультет / кафедра naming them too', () => {
    expect(adminPositionCondition('DEAN')).toEqual({
      OR: [{ adminPositions: { has: 'DEAN' } }, { deanOfFaculty: { isNot: null } }],
    });
    expect(adminPositionCondition('DEPARTMENT_HEAD')).toEqual({
      OR: [{ adminPositions: { has: 'DEPARTMENT_HEAD' } }, { headOfDepartment: { isNot: null } }],
    });
  });

  it('finds any other post among the picked ones', () => {
    expect(adminPositionCondition('ACADEMIC_SECRETARY')).toEqual({
      adminPositions: { has: 'ACADEMIC_SECRETARY' },
    });
  });
});
