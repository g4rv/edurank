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
    activity: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeActivity } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockActivityFind = db.activity.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: null } };
const nnvEditorSession = { user: { id: 'editor-1', role: 'EDITOR', staffId: 'staff-nnv' } };

// APPROVED NPP self-report in an OPEN year — the discardable case
const approvedActivity = {
  id: 'activity-1',
  staffId: 'staff-1',
  year: 2026,
  score: 10,
  status: 'APPROVED',
  submittedByRole: 'NPP',
  activityType: { label: 'Конференції в Україні', template: { status: 'OPEN' } },
};

function mockTx() {
  const tx = {
    activity: {
      update: vi.fn().mockResolvedValue({}),
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
  mockAuth.mockResolvedValue(adminSession);
  mockActivityFind.mockResolvedValue(approvedActivity);
});

describe('removeActivity', () => {
  it('rejects USER role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'USER', staffId: 'staff-1' } });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an editor of a non-ННВ division', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    mockStaffFind.mockResolvedValue({ division: { name: 'Відділ кадрів' } });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Недостатньо прав',
    });
  });

  it('allows an ННВ editor', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    mockStaffFind.mockResolvedValue({ division: { name: 'Навчально-науковий відділ' } });
    const tx = mockTx();
    expect(await removeActivity('activity-1', 'причина')).toEqual({ success: true });
    expect(tx.activity.update).toHaveBeenCalled();
  });

  it('requires a non-empty reason', async () => {
    expect(await removeActivity('activity-1', '   ')).toEqual({
      error: 'Вкажіть причину відхилення',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an already removed entry', async () => {
    mockActivityFind.mockResolvedValue({ ...approvedActivity, status: 'REMOVED' });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Це досягнення не можна відхилити',
    });
  });

  it('rejects a division-entered value', async () => {
    mockActivityFind.mockResolvedValue({ ...approvedActivity, submittedByRole: 'DIVISION' });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Це досягнення не можна відхилити',
    });
  });

  it('rejects when the year is closed', async () => {
    mockActivityFind.mockResolvedValue({
      ...approvedActivity,
      activityType: { ...approvedActivity.activityType, template: { status: 'CLOSED' } },
    });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });

  it('discards as admin: sets REMOVED with reason, audits, recomputes', async () => {
    const tx = mockTx();
    expect(await removeActivity('activity-1', '  публікацію не знайдено  ')).toEqual({
      success: true,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: expect.objectContaining({
        status: 'REMOVED',
        removedByUserId: 'admin-1',
        removeReason: 'публікацію не знайдено',
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
