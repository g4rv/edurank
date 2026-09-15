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
import { createScienceYear, cloneScienceYear, openScienceYear, closeScienceYear } from './actions';

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
      () => createScienceYear({ academicYear: '2027/2028', orderRef: null, minHoursPerRate: 500 }),
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
      await createScienceYear({ academicYear: '2027', orderRef: null, minHoursPerRate: 500 })
    ).toEqual({ error: expect.any(String) });
    expect(
      await createScienceYear({ academicYear: '2027/2029', orderRef: null, minHoursPerRate: 500 })
    ).toEqual({ error: expect.any(String) });
  });

  it('refuses a year that already exists', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue({ id: 't1' });
    expect(
      await createScienceYear({ academicYear: '2026/2027', orderRef: null, minHoursPerRate: 500 })
    ).toEqual({ error: expect.stringContaining('2026/2027') });
  });

  it('derives stakeYear from the first half and creates it CLOSED', async () => {
    (db.sciencePlanTemplate.findUnique as Mock).mockResolvedValue(null);
    await createScienceYear({ academicYear: '2027/2028', orderRef: 'N160', minHoursPerRate: 500 });
    expect((db.sciencePlanTemplate.create as Mock).mock.calls[0][0].data).toMatchObject({
      academicYear: '2027/2028',
      stakeYear: 2027,
      status: 'CLOSED',
    });
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
                requiresFile: false,
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
    });
    expect((db.scienceWorkType.create as Mock).mock.calls[0][0].data).toMatchObject({
      code: 'article',
      reuse: 'ONCE',
      sharing: 'SHARED',
      scoring: { kind: 'SELECT_MULT' },
      identityFields: ['pages'],
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
