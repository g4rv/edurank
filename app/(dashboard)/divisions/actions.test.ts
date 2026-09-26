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
    division: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createDivision, deleteDivision, updateDivision } from './actions';

const mockAuth = auth as unknown as Mock;
const mockDivisionFind = db.division.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

function mockTx() {
  const tx = {
    division: {
      create: vi.fn().mockResolvedValue({ id: 'div-1' }),
      findUnique: vi.fn().mockResolvedValue({
        name: 'ННВ',
        canModerateRating: true,
        canOverseeScience: false,
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Divisions control the permission system itself — EDITOR must NEVER manage them,
// no matter what entity permissions their division holds (privilege escalation).
describe('division actions authorization', () => {
  it('createDivision rejects EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    expect(
      await createDivision({
        name: 'Новий відділ',
        canModerateRating: false,
        canOverseeScience: false,
      })
    ).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('deleteDivision rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 's1' } });
    expect(await deleteDivision('div-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('createDivision allows ADMIN and audits', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();
    expect(
      await createDivision({
        name: 'Новий відділ',
        canModerateRating: false,
        canOverseeScience: false,
      })
    ).toEqual({
      redirectTo: '/divisions',
    });
    expect(tx.division.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('deleteDivision refuses when staff are still attached', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockDivisionFind.mockResolvedValue({ name: 'ННВ', _count: { staff: 4 } });
    expect(await deleteDivision('div-1')).toEqual({
      error: 'Неможливо видалити відділ, до якого прикріплений персонал',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// «Перевірка науки» (D43) is a permission change — written and audited exactly
// like «Модерація рейтингу».
describe('«Перевірка науки» on a division', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
  });

  it('is written when a division is created', async () => {
    const tx = mockTx();
    await createDivision({
      name: 'Новий відділ',
      canModerateRating: false,
      canOverseeScience: true,
    });
    expect(tx.division.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ canOverseeScience: true }) })
    );
  });

  it('is written and shows in the audit diff when it is switched on', async () => {
    const tx = mockTx();
    await updateDivision('div-1', {
      name: 'ННВ',
      canModerateRating: true,
      canOverseeScience: true,
    });
    expect(tx.division.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ canOverseeScience: true }) })
    );
    const { changes } = tx.auditLog.create.mock.calls[0][0].data;
    expect(changes).toHaveProperty('canOverseeScience');
    expect(changes).not.toHaveProperty('canModerateRating');
  });
});
