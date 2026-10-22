import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/scope', () => ({
  scopeOf: vi.fn(),
  headOf: vi.fn(),
  scienceDeputyOf: vi.fn(async (id: string) => (id === 'z1' ? ['dept-A'] : [])),
}));
vi.mock('@/lib/db', () => ({
  db: {
    ratingTemplate: { findFirst: vi.fn() },
    department: { findUnique: vi.fn() },
    departmentIndicator: { findMany: vi.fn() },
    departmentReport: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { EMPTY_NARRATIVE } from '@/validations/department-report';
import { saveDepartmentReport } from './actions';

const mockAuth = auth as unknown as Mock;
const mockScope = scopeOf as unknown as Mock;
const mockHeadOf = headOf as unknown as Mock;
/** activeYear() and the year's status both read the active template */
const mockTemplate = db.ratingTemplate.findFirst as unknown as Mock;
const mockDepartment = db.department.findUnique as unknown as Mock;
const mockIndicators = db.departmentIndicator.findMany as unknown as Mock;
const mockPrevious = db.departmentReport.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const ADMIN = { user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } };
const HEAD = { user: { id: 'h1', role: 'USER', staffId: 'h1' } };
const DEAN = { user: { id: 'd1', role: 'USER', staffId: 'd1' } };

const INDICATORS = [
  {
    id: 'ind-h',
    year: 2026,
    itemNumber: '1',
    order: 0,
    label: 'Гранти',
    kind: 'HEADING',
    coefficient: 0,
    options: [],
    isActive: true,
  },
  {
    id: 'ind-11',
    year: 2026,
    itemNumber: '1.1',
    order: 1,
    label: 'Горизонт',
    kind: 'COUNT',
    coefficient: 50,
    options: [],
    isActive: true,
  },
];

const payload = (over: Record<string, unknown> = {}) => ({
  departmentId: 'dept-A',
  year: 2026,
  values: { 'ind-11': 3 },
  narrative: EMPTY_NARRATIVE,
  ...over,
});

let tx: {
  departmentReport: { upsert: Mock };
  auditLog: { create: Mock };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTemplate.mockResolvedValue({ year: 2026, status: 'OPEN' });
  mockScope.mockImplementation(async (id: string) =>
    id === 'h1' ? ['dept-A'] : id === 'd1' ? ['dept-A', 'dept-B'] : []
  );
  mockHeadOf.mockImplementation(async (id: string) => (id === 'h1' ? ['dept-A'] : []));
  mockDepartment.mockResolvedValue({ id: 'dept-A', name: 'Кафедра історії' });
  mockIndicators.mockResolvedValue(INDICATORS);
  mockPrevious.mockResolvedValue(null);
  tx = {
    departmentReport: { upsert: vi.fn().mockResolvedValue({ id: 'rep-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
});

describe('saveDepartmentReport', () => {
  it('saves a завідувач’s own report with its total and an audit entry', async () => {
    mockAuth.mockResolvedValue(HEAD);

    expect(await saveDepartmentReport(payload())).toEqual({ success: true, totalScore: 150 });
    expect(tx.departmentReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departmentId_year: { departmentId: 'dept-A', year: 2026 } },
        create: expect.objectContaining({
          totalScore: 150,
          updatedById: 'h1',
          values: { 'ind-11': 3 },
        }),
        update: expect.objectContaining({ totalScore: 150, updatedById: 'h1' }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entity: 'DepartmentReport',
        entityId: 'rep-1',
        label: 'Кафедра історії — рейтинг кафедри 2026',
        userId: 'h1',
        changes: expect.objectContaining({ 'п. 1.1': { from: null, to: 3 } }),
      }),
    });
  });

  it('saves for the заступник з наукової роботи of the кафедра', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'z1', role: 'USER', staffId: 'z1' } });
    expect(await saveDepartmentReport(payload())).toEqual({ success: true, totalScore: 150 });
    expect(tx.departmentReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ updatedById: 'z1' }) })
    );
  });

  it('refuses a завідувач saving another кафедра', async () => {
    mockAuth.mockResolvedValue(HEAD);
    const result = await saveDepartmentReport(payload({ departmentId: 'dept-B' }));
    expect(result).toEqual({
      error: 'Звіт кафедри заповнює завідувач або заступник з наукової роботи',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a декан, who may only read', async () => {
    mockAuth.mockResolvedValue(DEAN);
    const result = await saveDepartmentReport(payload());
    expect(result).toEqual({
      error: 'Звіт кафедри заповнює завідувач або заступник з наукової роботи',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a year that is not the active one', async () => {
    mockAuth.mockResolvedValue(HEAD);
    const result = await saveDepartmentReport(payload({ year: 2025 }));
    expect(result).toEqual({
      error: 'Цей рік більше не редагується. Актуальний рік — 2026. Оновіть сторінку',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses once the year is closed', async () => {
    mockAuth.mockResolvedValue(HEAD);
    mockTemplate.mockResolvedValue({ year: 2026, status: 'CLOSED' });
    const result = await saveDepartmentReport(payload());
    expect(result).toEqual({ error: 'Рейтинговий рік закрито. Звіт не редагується' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a value on a heading', async () => {
    mockAuth.mockResolvedValue(HEAD);
    const result = await saveDepartmentReport(payload({ values: { 'ind-h': 1 } }));
    expect(result).toEqual({ error: 'Показник не знайдено. Оновіть сторінку' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a malformed payload', async () => {
    mockAuth.mockResolvedValue(HEAD);
    expect(await saveDepartmentReport(payload({ values: { 'ind-11': -2 } }))).toEqual({
      error: 'Невірні дані форми',
    });
  });

  it('lets ADMIN save any кафедра and records an update', async () => {
    mockAuth.mockResolvedValue(ADMIN);
    mockDepartment.mockResolvedValue({ id: 'dept-Z', name: 'Кафедра Z' });
    mockPrevious.mockResolvedValue({
      values: { 'ind-11': 1 },
      narrative: EMPTY_NARRATIVE,
      totalScore: 50,
    });

    expect(await saveDepartmentReport(payload({ departmentId: 'dept-Z' }))).toEqual({
      success: true,
      totalScore: 150,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        userId: 'a1',
        changes: expect.objectContaining({
          'п. 1.1': { from: 1, to: 3 },
          Всього: { from: 50, to: 150 },
        }),
      }),
    });
  });
});
