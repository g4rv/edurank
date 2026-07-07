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
    staff: { findUnique: vi.fn() },
    activityType: { findUnique: vi.fn() },
    activity: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createActivity, deleteActivity } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockTypeFind = db.activityType.findUnique as unknown as Mock;
const mockActivityFind = db.activity.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const userSession = { user: { id: 'user-1', role: 'USER', staffId: 'staff-1' } };
const nppStaff = { isNpp: true, lastName: 'Тест', firstName: 'Тест', patronymic: 'Тестович' };

// conf_ukraine: FIXED, coefficient 10, maxPerYear 5, evidence = title + optional link
const confUkraineType = {
  id: 'type-1',
  code: 'conf_ukraine',
  label: 'Конференції в Україні',
  coefficient: 10,
  inputSource: 'NPP_SUBMISSION',
  isActive: true,
  template: { year: 2026, isActive: true, status: 'OPEN' },
};

function mockTx({ existingCount = 0 } = {}) {
  const tx = {
    activity: {
      count: vi.fn().mockResolvedValue(existingCount),
      create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'activity-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(userSession);
  mockStaffFind.mockResolvedValue(nppStaff);
  mockTypeFind.mockResolvedValue(confUkraineType);
});

describe('createActivity', () => {
  it('rejects non-USER roles (an editor cannot submit for anyone)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'EDITOR', staffId: 'staff-2' } });
    const result = await createActivity('type-1', { title: 'X' });
    expect(result).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects a USER without a linked staff record', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'USER', staffId: null } });
    const result = await createActivity('type-1', { title: 'X' });
    expect(result).toEqual({ error: 'Недостатньо прав' });
  });

  it('rejects non-НПП staff', async () => {
    mockStaffFind.mockResolvedValue({ ...nppStaff, isNpp: false });
    const result = await createActivity('type-1', { title: 'X' });
    expect(result).toEqual({ error: 'Подання досягнень доступне лише для НПП' });
  });

  it('rejects DIVISION_MANAGED activity types', async () => {
    mockTypeFind.mockResolvedValue({ ...confUkraineType, inputSource: 'DIVISION_MANAGED' });
    const result = await createActivity('type-1', { title: 'X' });
    expect(result).toEqual({ error: 'Цей показник недоступний для самостійного подання' });
  });

  it('rejects when the year is closed', async () => {
    mockTypeFind.mockResolvedValue({
      ...confUkraineType,
      template: { ...confUkraineType.template, status: 'CLOSED' },
    });
    const result = await createActivity('type-1', { title: 'X' });
    expect(result).toEqual({ error: 'Рейтинговий рік закрито для подання' });
  });

  it('rejects invalid evidence', async () => {
    mockTx();
    const result = await createActivity('type-1', { title: '' });
    expect(result).toEqual({ error: 'Невірні дані форми' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('enforces the «не більше 5» cap', async () => {
    mockTx({ existingCount: 5 });
    const result = await createActivity('type-1', { title: 'Конференція' });
    expect(result).toEqual({ error: 'Не більше 5 подань цього показника на рік' });
  });

  it('creates an auto-approved activity for own staff, audits, and recomputes', async () => {
    const tx = mockTx();
    const result = await createActivity('type-1', { title: 'Конференція' });

    expect(result).toEqual({ success: true, score: 10 });
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        staffId: 'staff-1', // from the session, never from the client
        activityTypeId: 'type-1',
        year: 2026, // derived from the template
        status: 'APPROVED',
        submittedByRole: 'NPP',
        score: 10,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId_year: { staffId: 'staff-1', year: 2026 } },
      })
    );
  });
});

// An APPROVED, own NPP self-report in an OPEN year — the deletable case
const ownActivity = {
  id: 'activity-1',
  staffId: 'staff-1',
  year: 2026,
  score: 10,
  status: 'APPROVED',
  submittedByRole: 'NPP',
  activityType: {
    code: 'conf_ukraine',
    label: 'Конференції в Україні',
    template: { status: 'OPEN' },
  },
};

describe('deleteActivity', () => {
  beforeEach(() => {
    mockActivityFind.mockResolvedValue(ownActivity);
  });

  it('rejects non-USER roles', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'EDITOR', staffId: 'staff-2' } });
    expect(await deleteActivity('activity-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects deleting another staff's activity", async () => {
    mockActivityFind.mockResolvedValue({ ...ownActivity, staffId: 'staff-999' });
    expect(await deleteActivity('activity-1')).toEqual({ error: 'Досягнення не знайдено' });
  });

  it('rejects deleting a division-entered value', async () => {
    mockActivityFind.mockResolvedValue({ ...ownActivity, submittedByRole: 'DIVISION' });
    expect(await deleteActivity('activity-1')).toEqual({
      error: 'Це досягнення не можна видалити',
    });
  });

  it('rejects deleting a discarded (REMOVED) entry', async () => {
    mockActivityFind.mockResolvedValue({ ...ownActivity, status: 'REMOVED' });
    expect(await deleteActivity('activity-1')).toEqual({
      error: 'Це досягнення не можна видалити',
    });
  });

  it('rejects deleting in a closed year', async () => {
    mockActivityFind.mockResolvedValue({
      ...ownActivity,
      activityType: { ...ownActivity.activityType, template: { status: 'CLOSED' } },
    });
    expect(await deleteActivity('activity-1')).toEqual({ error: 'Рейтинговий рік закрито' });
  });

  it('deletes own open-year self-report, audits, and recomputes', async () => {
    const tx = mockTx();
    expect(await deleteActivity('activity-1')).toEqual({ success: true });
    expect(tx.activity.delete).toHaveBeenCalledWith({ where: { id: 'activity-1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId_year: { staffId: 'staff-1', year: 2026 } },
      })
    );
  });
});
