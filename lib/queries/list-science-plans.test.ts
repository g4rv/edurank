import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findMany: vi.fn() }, sciencePlanTemplate: { findUnique: vi.fn() } },
}));

import { db } from '@/lib/db';
import { listSciencePlans } from './list-science-plans';

const mockStaff = db.staff.findMany as unknown as Mock;
const mockTemplate = db.sciencePlanTemplate.findUnique as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockTemplate.mockResolvedValue({ id: 't1', academicYear: '2026/2027', minHoursPerRate: 500 });
  mockStaff.mockResolvedValue([]);
});

const conditions = () => mockStaff.mock.calls[0][0].where as Record<string, unknown>;

describe('who is on a кафедра', () => {
  it('finds сумісники as well as the кафедра’s own staff', async () => {
    await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });

    expect(conditions().OR).toEqual([
      { departmentId: { in: ['d1'] } },
      { partTimeDepartments: { some: { departmentId: { in: ['d1'] } } } },
    ]);
  });

  it('excludes archived people — a plan is about the current year', async () => {
    await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(conditions().archivedAt).toBeNull();
  });

  it('asks only for НПП', async () => {
    await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(conditions().isNpp).toBe(true);
  });
});

describe('the rows it returns', () => {
  it('gives a person one row per кафедра they work on', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Перчук',
        firstName: 'Оксана',
        patronymic: 'І',
        departmentId: 'd1',
        department: { id: 'd1', name: 'Кафедра історії' },
        partTimeDepartments: [{ department: { id: 'd2', name: 'Кафедра філософії' } }],
        sciencePlans: [],
      },
    ]);

    const rows = await listSciencePlans({ templateId: 't1', departmentIds: ['d1', 'd2'] });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.departmentName).sort()).toEqual(
      ['Кафедра філософії', 'Кафедра історії'].sort()
    );
  });

  it('shows no target where the кафедра has no розподіл', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Іваненко',
        firstName: 'Іван',
        patronymic: 'І',
        departmentId: 'd1',
        department: { id: 'd1', name: 'Кафедра історії' },
        partTimeDepartments: [],
        sciencePlans: [{ departmentId: 'd1', rateHundredths: null, rows: [] }],
      },
    ]);

    const [row] = await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(row.targetHundredths).toBeNull();
    expect(row.plannedHundredths).toBe(0);
  });

  it('sums the planned hours of an existing plan', async () => {
    mockStaff.mockResolvedValue([
      {
        id: 's1',
        lastName: 'Іваненко',
        firstName: 'Іван',
        patronymic: 'І',
        departmentId: 'd1',
        department: { id: 'd1', name: 'Кафедра історії' },
        partTimeDepartments: [],
        sciencePlans: [
          {
            departmentId: 'd1',
            rateHundredths: 100,
            rows: [{ plannedHundredths: 30000 }, { plannedHundredths: 12000 }],
          },
        ],
      },
    ]);

    const [row] = await listSciencePlans({ templateId: 't1', departmentIds: ['d1'] });
    expect(row.plannedHundredths).toBe(42000);
    expect(row.targetHundredths).toBe(50000);
    expect(row.shortfallHundredths).toBe(8000);
  });
});
