import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    staff: { findUnique: vi.fn() },
    scienceWorkType: { findFirst: vi.fn() },
    sciencePlan: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    sciencePlanRow: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    stakeAllocation: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { savePlanRow, deletePlanRow } from './actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveScienceTemplate as unknown as Mock;

/**
 * The article type: SELECT_MULT, 50 г per page for Scopus.
 *
 * Field names follow the real convention the scoring engine reads by hardcoded
 * key (see lib/science/work-types-2027.ts and lib/specs/scoring.ts): the
 * select is named `option`, the multiplier `credits`. Renaming these breaks
 * computeScore — confirmed against the real catalogue's own 'article' type.
 */
const ARTICLE = {
  id: 'wt1',
  templateId: 't1',
  code: 'article',
  label: 'Наукова стаття',
  isActive: true,
  coefficient: 1,
  maxPerYear: null,
  scoring: { kind: 'SELECT_MULT' },
  evidenceFields: [
    { kind: 'text', name: 'title', label: 'Назва' },
    {
      kind: 'select',
      name: 'option',
      label: 'Видання',
      options: [
        { value: 'scopus', label: 'Scopus / WoS', points: 50 },
        { value: 'fahove_b', label: 'Фахове «Б»', points: 30 },
      ],
    },
    { kind: 'number', name: 'credits', label: 'Сторінок', min: 1 },
  ],
};

const GOOD = {
  departmentId: 'd1',
  workTypeId: 'wt1',
  details: { title: 'Про щось', option: 'scopus', credits: 10 },
};

/** Signed in, НПП, primary кафедра d1, сумісництво on d2. */
function signedIn() {
  mockAuth.mockResolvedValue({ user: { id: 'u1', staffId: 's1', role: 'USER' } });
  (db.staff.findUnique as Mock).mockResolvedValue({
    id: 's1',
    isNpp: true,
    departmentId: 'd1',
    partTimeDepartments: [{ departmentId: 'd2' }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
  mockTemplate.mockResolvedValue({
    id: 't1',
    academicYear: '2026/2027',
    status: 'OPEN',
    stakeYear: 2026,
    minHoursPerRate: 500,
  });
  (db.scienceWorkType.findFirst as Mock).mockResolvedValue(ARTICLE);
  (db.sciencePlan.findUnique as Mock).mockResolvedValue({
    id: 'p1',
    staffId: 's1',
    departmentId: 'd1',
    rateHundredths: 100,
  });
  (db.sciencePlanRow.count as Mock).mockResolvedValue(0);
  (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 100 });
  (db.sciencePlanRow.create as Mock).mockResolvedValue({ id: 'r1' });
});

describe('savePlanRow — who may write', () => {
  it('refuses an anonymous caller', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('refuses somebody who is not an НПП', async () => {
    (db.staff.findUnique as Mock).mockResolvedValue({
      id: 's1',
      isNpp: false,
      departmentId: 'd1',
      partTimeDepartments: [],
    });
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('refuses a кафедра the person does not work on', async () => {
    expect(await savePlanRow({ ...GOOD, departmentId: 'd9' })).toEqual({
      error: expect.any(String),
    });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('accepts the additional кафедра of a сумісник', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p2', rateHundredths: 25 });
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 25 });

    expect(await savePlanRow({ ...GOOD, departmentId: 'd2' })).toEqual({ ok: true });
    expect(db.sciencePlanRow.create).toHaveBeenCalled();
  });
});

describe('savePlanRow — which year and which type', () => {
  it('refuses when there is no open template', async () => {
    mockTemplate.mockResolvedValue(null);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
  });

  it('refuses when the template is CLOSED', async () => {
    mockTemplate.mockResolvedValue({
      id: 't1',
      status: 'CLOSED',
      stakeYear: 2026,
      minHoursPerRate: 500,
    });
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('looks the work type up by template as well as by id', async () => {
    await savePlanRow(GOOD);
    expect((db.scienceWorkType.findFirst as Mock).mock.calls[0][0].where).toMatchObject({
      id: 'wt1',
      templateId: 't1',
      isActive: true,
    });
  });

  it('refuses a work type that does not answer that lookup', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(null);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.any(String) });
  });

  it('refuses when the type is already at maxPerYear', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, maxPerYear: 5 });
    (db.sciencePlanRow.count as Mock).mockResolvedValue(5);
    expect(await savePlanRow(GOOD)).toEqual({ error: expect.stringContaining('5') });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });
});

describe('savePlanRow — the hours', () => {
  it('refuses details the type’s own schema rejects', async () => {
    expect(
      await savePlanRow({ ...GOOD, details: { title: '', option: 'scopus', credits: 0 } })
    ).toEqual({
      error: expect.any(String),
    });
    expect(db.sciencePlanRow.create).not.toHaveBeenCalled();
  });

  it('stores INTEGER HUNDREDTHS — 10 сторінок × 50 г = 500 год → 50000', async () => {
    await savePlanRow(GOOD);
    const written = (db.sciencePlanRow.create as Mock).mock.calls[0][0].data;
    expect(written.plannedHundredths).toBe(50000);
    expect(Number.isInteger(written.plannedHundredths)).toBe(true);
  });

  it('prices the chosen variant, not the first one', async () => {
    await savePlanRow({ ...GOOD, details: { title: 'Про щось', option: 'fahove_b', credits: 10 } });
    expect((db.sciencePlanRow.create as Mock).mock.calls[0][0].data.plannedHundredths).toBe(30000);
  });
});

describe('savePlanRow — the plan and its ставка', () => {
  it('creates the plan on first save, copying the кафедра’s ставка', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p1', rateHundredths: 100 });

    await savePlanRow(GOOD);

    expect((db.sciencePlan.create as Mock).mock.calls[0][0].data).toMatchObject({
      staffId: 's1',
      departmentId: 'd1',
      templateId: 't1',
      rateHundredths: 100,
    });
  });

  it('leaves rateHundredths null when the кафедра has no розподіл', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p1', rateHundredths: null });

    await savePlanRow(GOOD);

    expect((db.sciencePlan.create as Mock).mock.calls[0][0].data.rateHundredths).toBeNull();
  });

  it('asks for the allocation on THIS кафедра and THIS stake year', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.create as Mock).mockResolvedValue({ id: 'p1', rateHundredths: 100 });

    await savePlanRow(GOOD);

    expect((db.stakeAllocation.findFirst as Mock).mock.calls[0][0].where).toMatchObject({
      staffId: 's1',
      distribution: { departmentId: 'd1', year: 2026 },
    });
  });

  it('refreshes a stale ставка on a later save', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({
      id: 'p1',
      staffId: 's1',
      departmentId: 'd1',
      rateHundredths: null,
    });
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 75 });

    await savePlanRow(GOOD);

    expect((db.sciencePlan.update as Mock).mock.calls[0][0].data).toMatchObject({
      rateHundredths: 75,
    });
  });

  it('writes an audit entry', async () => {
    await savePlanRow(GOOD);
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe('deletePlanRow', () => {
  beforeEach(() => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      id: 'r1',
      plannedHundredths: 50000,
      workType: { label: 'Наукова стаття' },
      plan: { id: 'p1', staffId: 's1', templateId: 't1' },
    });
  });

  it('refuses a row on somebody else’s plan', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      id: 'r1',
      plannedHundredths: 50000,
      workType: { label: 'Наукова стаття' },
      plan: { id: 'p9', staffId: 's9', templateId: 't1' },
    });
    expect(await deletePlanRow('r1')).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.delete).not.toHaveBeenCalled();
  });

  it('refuses when the template is CLOSED', async () => {
    mockTemplate.mockResolvedValue({
      id: 't1',
      status: 'CLOSED',
      stakeYear: 2026,
      minHoursPerRate: 500,
    });
    expect(await deletePlanRow('r1')).toEqual({ error: expect.any(String) });
    expect(db.sciencePlanRow.delete).not.toHaveBeenCalled();
  });

  it('refuses a row that no longer exists, without throwing', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue(null);
    expect(await deletePlanRow('r1')).toEqual({ error: expect.any(String) });
  });

  it('deletes its own row and writes an audit entry', async () => {
    expect(await deletePlanRow('r1')).toEqual({ ok: true });
    expect((db.sciencePlanRow.delete as Mock).mock.calls[0][0].where).toEqual({ id: 'r1' });
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});
