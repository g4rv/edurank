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
    ratingTemplate: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      // backfillProfileDerived: no active open template → sweep is a no-op
      findFirst: vi.fn().mockResolvedValue(null),
    },
    activityType: { findUnique: vi.fn() },
    division: { findUnique: vi.fn() },
    staff: { findMany: vi.fn().mockResolvedValue([]) },
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { closeYear, reopenYear, updateActivityType, cloneTemplate } from './actions';

const mockAuth = auth as unknown as Mock;
const mockTemplateFind = db.ratingTemplate.findUnique as unknown as Mock;
const mockTypeFind = db.activityType.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: 'admin-1' } };
const editorSession = { user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } };

function mockTx() {
  const tx = {
    activity: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    activityType: {
      create: vi.fn().mockResolvedValue({ id: 'type-new' }),
      update: vi.fn().mockResolvedValue({}),
    },
    ratingTemplate: {
      create: vi.fn().mockResolvedValue({ id: 'tpl-new' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    ratingSection: { create: vi.fn().mockResolvedValue({ id: 'sec-new' }) },
    ratingEntry: {
      updateMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(adminSession);
});

describe('closeYear', () => {
  const openTemplate = { id: 'tpl-1', name: 'Рейтинг НПП 2026', status: 'OPEN' };

  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await closeYear(2026)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an already closed year', async () => {
    mockTemplateFind.mockResolvedValue({ ...openTemplate, status: 'CLOSED' });
    expect(await closeYear(2026)).toEqual({ error: 'Рік вже закрито' });
  });

  it('purges REMOVED rows, snapshots entries and sets CLOSED', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    const tx = mockTx();
    tx.activity.findMany.mockResolvedValue([
      {
        id: 'a1',
        staffId: 'staff-1',
        score: 300,
        evidence: { option: 'leader', title: 'Тема' },
        activityType: {
          code: 'ndr_execution',
          label: 'Виконання НДР',
          section: { number: 3, title: 'Наука' },
        },
      },
    ]);

    expect(await closeYear(2026)).toEqual({ success: true, message: 'Рік 2026 закрито' });

    expect(tx.activity.deleteMany).toHaveBeenCalledWith({
      where: { year: 2026, status: 'REMOVED' },
    });
    // Snapshot written for the staff with approved rows
    expect(tx.ratingEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { staffId: 'staff-1', year: 2026 } })
    );
    const snapshot = tx.ratingEntry.updateMany.mock.calls[0][0].data.snapshot;
    expect(snapshot.total).toBe(300);
    expect(snapshot.sections).toHaveLength(5);
    expect(snapshot.sections[2].items[0].label).toBe('Виконання НДР');
    // Authoritative flag flipped with the closer recorded
    expect(tx.ratingTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: expect.objectContaining({ status: 'CLOSED', closedByUserId: 'admin-1' }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});

describe('reopenYear', () => {
  it('rejects a year that is not closed', async () => {
    mockTemplateFind.mockResolvedValue({ id: 'tpl-1', name: 'x', status: 'OPEN' });
    expect(await reopenYear(2026)).toEqual({ error: 'Рік не закрито' });
  });

  it('reopens: status OPEN, closedAt/By cleared, audited', async () => {
    mockTemplateFind.mockResolvedValue({ id: 'tpl-1', name: 'x', status: 'CLOSED' });
    const tx = mockTx();
    expect(await reopenYear(2026)).toEqual({ success: true, message: 'Рік 2026 знову відкрито' });
    expect(tx.ratingTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: { status: 'OPEN', closedAt: null, closedByUserId: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});

describe('updateActivityType', () => {
  const type = {
    id: 'type-1',
    label: 'Виконання НДР',
    coefficient: 1,
    coefficientNote: null,
    verifyingDivisionId: 'div-nnv',
    isActive: true,
    inputSource: 'DIVISION_MANAGED',
    template: { status: 'OPEN', year: 2026 },
  };
  const valid = {
    label: 'Виконання НДР',
    coefficient: 2,
    coefficientNote: null,
    verifyingDivisionId: 'div-nnv',
    isActive: true,
  };

  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await updateActivityType('type-1', valid)).toEqual({ error: 'Недостатньо прав' });
  });

  it('rejects when the year is closed', async () => {
    mockTypeFind.mockResolvedValue({ ...type, template: { status: 'CLOSED', year: 2026 } });
    expect(await updateActivityType('type-1', valid)).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });

  it('rejects a division-managed type without a division', async () => {
    mockTypeFind.mockResolvedValue(type);
    expect(await updateActivityType('type-1', { ...valid, verifyingDivisionId: null })).toEqual({
      error: 'Для показника відділу потрібно вказати відділ',
    });
  });

  it('updates and audits the diff', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    expect(await updateActivityType('type-1', valid)).toEqual({
      success: true,
      message: 'Збережено',
    });
    expect(tx.activityType.update).toHaveBeenCalledWith({
      where: { id: 'type-1' },
      data: valid,
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('leaves ratings alone when isActive did not change', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    await updateActivityType('type-1', valid);
    expect(tx.ratingEntry.upsert).not.toHaveBeenCalled();
  });

  // «Показник активний» = «counts this year»: switching it off must pull the
  // points out of every rating that holds the indicator, right away.
  it('deactivating recomputes every staff member holding the indicator', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    tx.activity.findMany
      // 1st call: distinct holders of this type
      .mockResolvedValueOnce([{ staffId: 'staff-1' }, { staffId: 'staff-2' }])
      // 2nd call: their remaining counting rows (the type is now inactive → none)
      .mockResolvedValueOnce([]);

    expect(await updateActivityType('type-1', { ...valid, isActive: false })).toEqual({
      success: true,
      message: 'Збережено. Оновлено рейтинг: 2 НПП',
    });

    expect(tx.activity.findMany).toHaveBeenCalledWith({
      where: { activityTypeId: 'type-1', year: 2026 },
      select: { staffId: true },
      distinct: ['staffId'],
    });
    // Both holders zeroed
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(2);
    for (const call of tx.ratingEntry.upsert.mock.calls) {
      expect(call[0].update.totalScore).toBe(0);
    }
  });

  it('reactivating recomputes too, bringing the points back', async () => {
    mockTypeFind.mockResolvedValue({ ...type, isActive: false });
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    tx.activity.findMany
      .mockResolvedValueOnce([{ staffId: 'staff-1' }])
      .mockResolvedValueOnce([
        { staffId: 'staff-1', score: 300, activityType: { section: { number: 3 } } },
      ]);

    expect(await updateActivityType('type-1', { ...valid, isActive: true })).toEqual({
      success: true,
      message: 'Збережено. Оновлено рейтинг: 1 НПП',
    });
    expect(tx.ratingEntry.upsert.mock.calls[0][0].update).toMatchObject({
      section3Score: 300,
      totalScore: 300,
    });
  });

  it('reports a plain message when nobody holds the indicator', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    tx.activity.findMany.mockResolvedValueOnce([]);

    expect(await updateActivityType('type-1', { ...valid, isActive: false })).toEqual({
      success: true,
      message: 'Збережено',
    });
    expect(tx.ratingEntry.upsert).not.toHaveBeenCalled();
  });
});

describe('cloneTemplate', () => {
  it('rejects when the target year already exists', async () => {
    mockTemplateFind
      .mockResolvedValueOnce({
        id: 'tpl-1',
        year: 2026,
        sections: [],
        activityTypes: [],
      })
      .mockResolvedValueOnce({ id: 'tpl-2027' });
    expect(await cloneTemplate(2026)).toEqual({ error: 'Рік 2027 вже існує' });
  });

  it('copies sections and types into year+1', async () => {
    mockTemplateFind
      .mockResolvedValueOnce({
        id: 'tpl-1',
        year: 2026,
        sections: [{ id: 'sec-1', number: 1, title: 'Розділ 1' }],
        activityTypes: [
          {
            id: 'type-1',
            sectionId: 'sec-1',
            order: 1,
            code: 'pedagogical_experience',
            label: 'Стаж',
            coefficient: 1,
            coefficientNote: null,
            inputSource: 'DIVISION_MANAGED',
            verifyingDivisionId: 'div-kadry',
            isActive: true,
          },
        ],
      })
      .mockResolvedValueOnce(null);
    const tx = mockTx();

    expect(await cloneTemplate(2026)).toEqual({ success: true, message: 'Створено рік 2027' });
    expect(tx.ratingTemplate.create).toHaveBeenCalledWith({
      data: { year: 2027, name: 'Рейтинг НПП 2027', isActive: false },
    });
    expect(tx.ratingSection.create).toHaveBeenCalledTimes(1);
    expect(tx.activityType.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'tpl-new',
        sectionId: 'sec-new',
        code: 'pedagogical_experience',
        verifyingDivisionId: 'div-kadry',
      }),
    });
  });
});
