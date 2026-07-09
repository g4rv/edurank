import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('bcryptjs', () => ({ hash: vi.fn().mockResolvedValue('hashed') }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createUser, deleteUser, forceLogoutUser } from './actions';

const mockAuth = auth as unknown as Mock;
const mockUserFind = db.user.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: null } };

const newUser = {
  email: 'new@univ.ua',
  password: 'secret123',
  confirmPassword: 'secret123',
  role: 'USER' as const,
  staffId: null,
};

function mockTx() {
  const tx = {
    user: {
      create: vi.fn().mockResolvedValue({ id: 'user-1' }),
      findUnique: vi.fn().mockResolvedValue(null),
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
  mockAuth.mockResolvedValue(adminSession);
});

describe('user actions authorization', () => {
  it('createUser rejects EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    expect(await createUser(newUser)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('forceLogoutUser rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 's1' } });
    expect(await forceLogoutUser('user-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('createUser requires a password', async () => {
    expect(await createUser({ ...newUser, password: null, confirmPassword: null })).toEqual({
      error: "Пароль є обов'язковим",
    });
  });

  it('createUser allows ADMIN and audits', async () => {
    const tx = mockTx();
    expect(await createUser(newUser)).toEqual({ redirectTo: '/admin/users' });
    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('deleteUser refuses deleting your own account', async () => {
    expect(await deleteUser('admin-1')).toEqual({
      error: 'Неможливо видалити власний обліковий запис',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('deleteUser allows ADMIN for another account', async () => {
    mockUserFind.mockResolvedValue({ email: 'x@univ.ua', role: 'USER', staffId: null });
    const tx = mockTx();
    expect(await deleteUser('user-2')).toEqual({ redirectTo: '/admin/users' });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'user-2' } });
  });
});
