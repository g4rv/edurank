import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    sciencePlan: { findUnique: vi.fn(), updateMany: vi.fn() },
    division: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/permissions', () => ({ canActForDivision: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canActForDivision } from '@/lib/permissions';
import { unlockPlan } from './actions';

const mockAuth = auth as unknown as Mock;
const mockCanAct = canActForDivision as unknown as Mock;

const PLAN = {
  id: 'plan-1',
  lockedAt: new Date('2026-09-18T10:00:00Z'),
  staff: { lastName: 'Петренко', firstName: 'Петро', patronymic: 'Петрович' },
  department: { name: 'Кафедра математики' },
  template: { status: 'OPEN' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u1', staffId: 'staff-9', role: 'EDITOR' } });
  (db.sciencePlan.findUnique as Mock).mockResolvedValue(PLAN);
  (db.sciencePlan.updateMany as Mock).mockResolvedValue({ count: 1 });
  (db.division.findUnique as Mock).mockResolvedValue({ id: 'nnv-1' });
  mockCanAct.mockResolvedValue(true);
  (db.$transaction as Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(db));
});

describe('unlockPlan — who may reopen a submitted plan', () => {
  it('lets an ННВ editor reopen one', async () => {
    expect(await unlockPlan('plan-1')).toEqual({ ok: true });
    expect(db.sciencePlan.updateMany).toHaveBeenCalledWith({
      where: { id: 'plan-1', lockedAt: { not: null } },
      data: { lockedAt: null },
    });
  });

  it('lets ADMIN reopen one with no division at all', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', staffId: null, role: 'ADMIN' } });
    mockCanAct.mockResolvedValue(false);
    expect(await unlockPlan('plan-1')).toEqual({ ok: true });
  });

  it('refuses an editor whose division is not ННВ', async () => {
    mockCanAct.mockResolvedValue(false);
    expect(await unlockPlan('plan-1')).toEqual({ error: 'Недостатньо прав' });
    expect(db.sciencePlan.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an ordinary НПП — a завідувач reads this list, never decides on it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u3', staffId: 'staff-1', role: 'USER' } });
    mockCanAct.mockResolvedValue(false);
    expect(await unlockPlan('plan-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('resolves ННВ by registryKey, never by its editable name', async () => {
    await unlockPlan('plan-1');
    expect(db.division.findUnique).toHaveBeenCalledWith({
      where: { registryKey: 'NNV' },
      select: { id: true },
    });
  });
});

describe('unlockPlan — what it refuses', () => {
  it('refuses a plan that is not submitted', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({ ...PLAN, lockedAt: null });
    expect(await unlockPlan('plan-1')).toEqual({ error: 'Цей план ще не збережено' });
  });

  it('refuses a plan that does not exist', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    expect(await unlockPlan('nope')).toEqual({ error: 'План не знайдено' });
  });

  it('refuses a CLOSED навчальний рік — frozen history takes no writes', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({
      ...PLAN,
      template: { status: 'CLOSED' },
    });
    expect(await unlockPlan('plan-1')).toEqual({ error: 'Планування на цей рік закрито' });
    expect(db.sciencePlan.updateMany).not.toHaveBeenCalled();
  });

  it('tells the loser of a two-tab race rather than counting them as the opener', async () => {
    (db.sciencePlan.updateMany as Mock).mockResolvedValue({ count: 0 });
    expect(await unlockPlan('plan-1')).toEqual({ error: 'Цей план уже відкрито' });
  });
});

describe('unlockPlan — the trail it leaves', () => {
  it('writes an audit entry naming the person and the кафедра', async () => {
    await unlockPlan('plan-1');
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry).toMatchObject({
      action: 'UPDATE',
      entity: 'SciencePlan',
      entityId: 'plan-1',
      userId: 'u1',
    });
    // A сумісник has two plans, and this list shows them twice — the label has
    // to say which one was reopened.
    expect(entry.label).toBe('Петренко Петро Петрович — Кафедра математики');
  });

  it('touches only the lock — the rows and the records stay as they are', async () => {
    await unlockPlan('plan-1');
    const data = (db.sciencePlan.updateMany as Mock).mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['lockedAt']);
  });
});
