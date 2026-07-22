import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn(), findMany: vi.fn() },
    activityType: { findUnique: vi.fn() },
    activity: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { catalogueType } from '@/lib/rating/db-specs';
import {
  upsertDivisionActivity,
  clearDivisionActivity,
  batchUpsertDivisionActivity,
} from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockStaffFindMany = db.staff.findMany as unknown as Mock;
const mockTypeFind = db.activityType.findUnique as unknown as Mock;
const mockActivityFind = db.activity.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: null } };
const kadryEditor = { user: { id: 'editor-1', role: 'EDITOR', staffId: 'staff-kadry' } };

// KADRY-managed «Науково-педагогічний стаж» in the OPEN 2026 template.
// Form and scoring rule ride on the row, as the seed writes them.
const experienceSpecs = catalogueType('pedagogical_experience').specs;
const divisionType = {
  id: 'type-1',
  code: 'pedagogical_experience',
  label: 'Науково-педагогічний стаж',
  coefficient: 1,
  inputSource: 'DIVISION_MANAGED',
  isActive: true,
  verifyingDivisionId: 'div-kadry',
  evidenceFields: experienceSpecs.evidenceFields,
  scoring: experienceSpecs.scoring,
  template: { year: 2026, isActive: true, status: 'OPEN' },
};

const npp = { isNpp: true, lastName: 'Франко', firstName: 'Іван', patronymic: 'Якович' };

function mockTx(existing: { id: string; score: number; evidence: unknown } | null = null) {
  const tx = {
    activity: {
      findFirst: vi.fn().mockResolvedValue(existing),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'activity-new' }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(adminSession);
  mockTypeFind.mockResolvedValue(divisionType);
  mockStaffFind.mockResolvedValue(npp);
});

describe('upsertDivisionActivity', () => {
  it('rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-1' } });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an editor of a different division', async () => {
    mockAuth.mockResolvedValue(kadryEditor);
    // getEditorDivisionId resolves the editor's own division
    mockStaffFind.mockResolvedValue({ divisionId: 'div-nnv' });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      error: 'Недостатньо прав',
    });
  });

  it('rejects an NPP self-submission code', async () => {
    mockTypeFind.mockResolvedValue({
      ...divisionType,
      inputSource: 'NPP_SUBMISSION',
      verifyingDivisionId: null,
    });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      error: 'Цей показник не вноситься відділом',
    });
  });

  it('rejects a profile-derived code', async () => {
    mockTypeFind.mockResolvedValue({
      ...divisionType,
      inputSource: 'PROFILE_DERIVED',
      verifyingDivisionId: null,
    });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      error: 'Цей показник не вноситься відділом',
    });
  });

  it('rejects when the year is closed', async () => {
    mockTypeFind.mockResolvedValue({
      ...divisionType,
      template: { ...divisionType.template, status: 'CLOSED' },
    });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });

  it('rejects a non-НПП staff member', async () => {
    mockStaffFind.mockResolvedValue({ ...npp, isNpp: false });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      error: 'Рейтинг ведеться лише для НПП',
    });
  });

  it('creates an APPROVED DIVISION row when none exists, audits, recomputes', async () => {
    const tx = mockTx(null);
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      success: true,
      score: 20,
    });
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        staffId: 'staff-1',
        year: 2026,
        score: 20,
        status: 'APPROVED',
        submittedByRole: 'DIVISION',
        approvedByUserId: 'admin-1',
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalled();
  });

  it('updates the existing live row instead of creating a second one', async () => {
    const tx = mockTx({ id: 'activity-old', score: 15, evidence: { value: 15 } });
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: 20 })).toEqual({
      success: true,
      score: 20,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-old' },
      data: expect.objectContaining({ score: 20 }),
    });
    expect(tx.activity.create).not.toHaveBeenCalled();
  });

  it('rejects invalid evidence', async () => {
    expect(await upsertDivisionActivity('staff-1', 'type-1', { value: -3 })).toEqual({
      error: 'Невірні дані форми',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('clearDivisionActivity', () => {
  const divisionActivity = {
    id: 'activity-1',
    staffId: 'staff-1',
    year: 2026,
    score: 20,
    status: 'APPROVED',
    submittedByRole: 'DIVISION',
    activityType: {
      label: 'Науково-педагогічний стаж',
      verifyingDivisionId: 'div-kadry',
      template: { status: 'OPEN' },
    },
  };

  beforeEach(() => {
    mockActivityFind.mockResolvedValue(divisionActivity);
  });

  it('rejects an NPP self-report row', async () => {
    mockActivityFind.mockResolvedValue({ ...divisionActivity, submittedByRole: 'NPP' });
    expect(await clearDivisionActivity('activity-1')).toEqual({
      error: 'Цей запис не вноситься відділом',
    });
  });

  it('rejects an editor of a different division', async () => {
    mockAuth.mockResolvedValue(kadryEditor);
    mockStaffFind.mockResolvedValue({ divisionId: 'div-nnv' });
    expect(await clearDivisionActivity('activity-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('deletes, audits and recomputes for the owning division editor', async () => {
    mockAuth.mockResolvedValue(kadryEditor);
    mockStaffFind.mockResolvedValue({ divisionId: 'div-kadry' });
    const tx = mockTx();
    expect(await clearDivisionActivity('activity-1')).toEqual({ success: true });
    expect(tx.activity.delete).toHaveBeenCalledWith({ where: { id: 'activity-1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalled();
  });
});

describe('batchUpsertDivisionActivity', () => {
  // ННВ-managed НДР theme: role select (керівник 300 / виконавець 200) + title
  const ndrSpecs = catalogueType('ndr_execution').specs;
  const ndrType = {
    ...divisionType,
    id: 'type-ndr',
    code: 'ndr_execution',
    label: 'Виконання НДР',
    verifyingDivisionId: 'div-nnv',
    evidenceFields: ndrSpecs.evidenceFields,
    scoring: ndrSpecs.scoring,
  };

  const franko = { id: 'staff-1', ...npp };
  const shevchenko = {
    id: 'staff-2',
    isNpp: true,
    lastName: 'Шевченко',
    firstName: 'Тарас',
    patronymic: 'Григорович',
  };

  const rows = [
    { staffId: 'staff-1', evidence: { option: 'leader', title: 'Тема НДР' } },
    { staffId: 'staff-2', evidence: { option: 'executor', title: 'Тема НДР' } },
  ];

  beforeEach(() => {
    mockTypeFind.mockResolvedValue(ndrType);
    mockStaffFindMany.mockResolvedValue([franko, shevchenko]);
  });

  it('rejects an editor of a different division', async () => {
    mockAuth.mockResolvedValue(kadryEditor);
    mockStaffFind.mockResolvedValue({ divisionId: 'div-kadry' });
    expect(await batchUpsertDivisionActivity('type-ndr', rows)).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an empty staff list and duplicated staff', async () => {
    expect(await batchUpsertDivisionActivity('type-ndr', [])).toEqual({
      error: 'Додайте хоча б одного НПП',
    });
    expect(
      await batchUpsertDivisionActivity('type-ndr', [rows[0], { ...rows[1], staffId: 'staff-1' }])
    ).toEqual({ error: 'Один НПП вказано декілька разів' });
  });

  it('rejects the whole batch when one person is not НПП, naming them', async () => {
    mockStaffFindMany.mockResolvedValue([franko, { ...shevchenko, isNpp: false }]);
    expect(await batchUpsertDivisionActivity('type-ndr', rows)).toEqual({
      error: 'Шевченко Тарас Григорович — не НПП',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects when any row has invalid evidence', async () => {
    expect(
      await batchUpsertDivisionActivity('type-ndr', [
        rows[0],
        { staffId: 'staff-2', evidence: { option: 'executor', title: '' } },
      ])
    ).toEqual({ error: 'Невірні дані форми' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('creates one row per person with role-based scores and recomputes each', async () => {
    const tx = mockTx(null);
    expect(await batchUpsertDivisionActivity('type-ndr', rows)).toEqual({
      success: true,
      saved: 2,
    });
    expect(tx.activity.create).toHaveBeenCalledTimes(2);
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ staffId: 'staff-1', score: 300, status: 'APPROVED' }),
    });
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ staffId: 'staff-2', score: 200 }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(2);
  });

  it('updates the live row for a person who already has one', async () => {
    const tx = mockTx({ id: 'activity-old', score: 200, evidence: rows[1].evidence });
    expect(await batchUpsertDivisionActivity('type-ndr', rows)).toEqual({
      success: true,
      saved: 2,
    });
    expect(tx.activity.update).toHaveBeenCalledTimes(2);
    expect(tx.activity.create).not.toHaveBeenCalled();
  });
});
