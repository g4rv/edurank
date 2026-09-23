import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    sciencePlanTemplate: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    scienceWorkType: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

import { requireAdmin } from '@/lib/permissions';
import { db } from '@/lib/db';
import {
  createScienceYear,
  cloneScienceYear,
  openScienceYear,
  closeScienceYear,
  updateScienceYearSettings,
} from './actions';

const mockRequireAdmin = requireAdmin as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ user: { id: 'admin1' } });
  // A sane default so actions that read-before-write (openScienceYear) find a
  // row unless a describe block below narrows it for its own case.
  (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue({
    id: 't2',
    academicYear: '2027/2028',
    status: 'CLOSED',
  });
  (db.sciencePlanTemplate.create as Mock).mockResolvedValue({ id: 'new1' });
});

describe('permission', () => {
  it('refuses a non-admin on every action', async () => {
    (requireAdmin as Mock).mockResolvedValue(null);
    for (const call of [
      () =>
        createScienceYear({
          academicYear: '2027/2028',
          orderRef: null,
          minHoursPerRate: 500,
          maxLookbackMonths: 12,
        }),
      () => cloneScienceYear('2026/2027'),
      () => openScienceYear('t1'),
      () => closeScienceYear('t1'),
    ]) {
      expect(await call()).toEqual({ error: 'Недостатньо прав' });
    }
    expect(db.sciencePlanTemplate.create).not.toHaveBeenCalled();
  });
});

describe('createScienceYear', () => {
  it('refuses a malformed навчальний рік', async () => {
    expect(
      await createScienceYear({
        academicYear: '2027',
        orderRef: null,
        minHoursPerRate: 500,
        maxLookbackMonths: 12,
      })
    ).toEqual({ error: expect.any(String) });
    expect(
      await createScienceYear({
        academicYear: '2027/2029',
        orderRef: null,
        minHoursPerRate: 500,
        maxLookbackMonths: 12,
      })
    ).toEqual({ error: expect.any(String) });
  });

  it('refuses a year that already exists', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue({ id: 't1' });
    expect(
      await createScienceYear({
        academicYear: '2026/2027',
        orderRef: null,
        minHoursPerRate: 500,
        maxLookbackMonths: 12,
      })
    ).toEqual({ error: expect.stringContaining('2026/2027') });
  });

  it('derives stakeYear from the first half and creates it CLOSED', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(null);
    await createScienceYear({
      academicYear: '2027/2028',
      orderRef: 'N160',
      minHoursPerRate: 500,
      maxLookbackMonths: 12,
    });
    expect((db.sciencePlanTemplate.create as Mock).mock.calls[0][0].data).toMatchObject({
      academicYear: '2027/2028',
      stakeYear: 2027,
      status: 'CLOSED',
    });
  });
});

describe('createScienceYear — D42, the lookback', () => {
  it('writes the lookback and puts it in the audit diff', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(null);
    await createScienceYear({
      academicYear: '2027/2028',
      orderRef: null,
      minHoursPerRate: 500,
      maxLookbackMonths: 8,
    });
    expect((db.sciencePlanTemplate.create as Mock).mock.calls[0][0].data).toMatchObject({
      maxLookbackMonths: 8,
    });
    const { changes } = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(changes).toHaveProperty('maxLookbackMonths');
  });

  it('refuses a lookback outside 0–60', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(null);
    expect(
      await createScienceYear({
        academicYear: '2027/2028',
        orderRef: null,
        minHoursPerRate: 500,
        maxLookbackMonths: 99,
      })
    ).toEqual({ error: 'Кількість місяців — ціле число від 0 до 60' });
    expect(db.sciencePlanTemplate.create).not.toHaveBeenCalled();
  });
});

describe('updateScienceYearSettings', () => {
  const EXISTING = {
    academicYear: '2026/2027',
    orderRef: '№152',
    minHoursPerRate: 500,
    maxLookbackMonths: 12,
  };
  const INPUT = { id: 't1', orderRef: '№152', minHoursPerRate: 500, maxLookbackMonths: 8 };

  beforeEach(() => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(EXISTING);
  });

  it('updates the three numbers and audits only what changed', async () => {
    expect(await updateScienceYearSettings(INPUT)).toMatchObject({ ok: true });
    expect(db.sciencePlanTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { orderRef: '№152', minHoursPerRate: 500, maxLookbackMonths: 8 },
    });
    const { changes } = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(changes).toHaveProperty('maxLookbackMonths');
    expect(changes).not.toHaveProperty('minHoursPerRate');
  });

  it('refuses a non-admin', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    expect(await updateScienceYearSettings(INPUT)).toEqual({ error: 'Недостатньо прав' });
    expect(db.sciencePlanTemplate.update).not.toHaveBeenCalled();
  });

  it('refuses a bad lookback', async () => {
    expect(await updateScienceYearSettings({ ...INPUT, maxLookbackMonths: -1 })).toEqual({
      error: 'Кількість місяців — ціле число від 0 до 60',
    });
  });

  it('refuses a year that does not exist', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(null);
    expect(await updateScienceYearSettings(INPUT)).toEqual({ error: 'Рік не знайдено' });
  });
});

describe('cloneScienceYear', () => {
  beforeEach(() => {
    (db.sciencePlanTemplate.findUnique as Mock).mockImplementation(({ where }) =>
      where.academicYear === '2026/2027'
        ? Promise.resolve({
            id: 't1',
            academicYear: '2026/2027',
            minHoursPerRate: 500,
            maxLookbackMonths: 8,
            workTypes: [
              {
                code: 'article',
                order: 1,
                itemNumber: '4',
                label: 'Наукова стаття',
                coefficient: 1,
                evidenceFields: [{ kind: 'number', name: 'pages' }],
                scoring: { kind: 'SELECT_MULT' },
                unitNote: 'За 1 сторінку',
                reportingForm: 'Екземпляр видання',
                reuse: 'ONCE',
                sharing: 'SHARED',
                identityFields: ['pages'],
                itemTitle: 'Наукові публікації',
                shortLabel: 'Стаття',
                linkRule: 'REQUIRED',
                fileRule: 'NONE',
                maxPerYear: null,
                isActive: true,
              },
            ],
          })
        : Promise.resolve(null)
    );
  });

  it('refuses when the source year does not exist', async () => {
    expect(await cloneScienceYear('2019/2020')).toEqual({ error: expect.any(String) });
  });

  it('creates the NEXT year, closed, and copies every work type with its JSON', async () => {
    await cloneScienceYear('2026/2027');

    expect((db.sciencePlanTemplate.create as Mock).mock.calls[0][0].data).toMatchObject({
      academicYear: '2027/2028',
      stakeYear: 2027,
      status: 'CLOSED',
      // D42: the next year starts with this year's lookback.
      maxLookbackMonths: 8,
    });
    expect((db.scienceWorkType.create as Mock).mock.calls[0][0].data).toMatchObject({
      code: 'article',
      reuse: 'ONCE',
      sharing: 'SHARED',
      scoring: { kind: 'SELECT_MULT' },
      identityFields: ['pages'],
      // The пункт's heading and the picker's short name — lost by the clone
      // before 2026-09-23, so the next year's picker read «Пункт 4».
      itemTitle: 'Наукові публікації',
      shortLabel: 'Стаття',
      // D47: the next year keeps each type's link and file rules.
      linkRule: 'REQUIRED',
      fileRule: 'NONE',
    });
  });
});

describe('openScienceYear', () => {
  it('closes whatever else is open, in the same transaction', async () => {
    await openScienceYear('t2');
    expect((db.sciencePlanTemplate.updateMany as Mock).mock.calls[0][0]).toMatchObject({
      where: { status: 'OPEN', id: { not: 't2' } },
      data: { status: 'CLOSED' },
    });
    expect((db.sciencePlanTemplate.update as Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 't2' },
      data: { status: 'OPEN' },
    });
  });
});

describe('closeScienceYear', () => {
  it('is a no-op on a year that is already closed', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue({ id: 't1', status: 'CLOSED' });
    expect(await closeScienceYear('t1')).toEqual({ ok: true });
    expect(db.sciencePlanTemplate.update).not.toHaveBeenCalled();
  });
});
