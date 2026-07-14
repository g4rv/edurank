import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('@/lib/db', () => ({
  db: { $transaction: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ signIn: vi.fn() }));
vi.mock('@/lib/activation', () => ({ findStaffByActivationToken: vi.fn() }));

import { db } from '@/lib/db';
import { signIn } from '@/lib/auth';
import { findStaffByActivationToken } from '@/lib/activation';
import { activateAction } from './actions';

const mockFindByToken = findStaffByActivationToken as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockSignIn = signIn as unknown as Mock;

const staff = {
  id: 'staff-1',
  email: 'kovalenko@university.edu.ua',
  lastName: 'Коваленко',
  firstName: 'Іван',
  patronymic: 'Петрович',
};

const validData = { password: 'password1', confirmPassword: 'password1' };

function mockTx() {
  const tx = {
    staff: { update: vi.fn().mockResolvedValue({}) },
    activationToken: { deleteMany: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByToken.mockResolvedValue(staff);
});

describe('activateAction', () => {
  it('rejects an unknown or expired token', async () => {
    mockFindByToken.mockResolvedValue(null);
    expect(await activateAction('bad-token', validData)).toEqual({
      error: 'Посилання недійсне або протерміноване',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects a short or mismatched password', async () => {
    expect(await activateAction('token', { password: 'short', confirmPassword: 'short' })).toEqual({
      error: 'Некоректні дані',
    });
    expect(
      await activateAction('token', { password: 'password1', confirmPassword: 'password2' })
    ).toEqual({ error: 'Некоректні дані' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('sets the password, consumes the token, audits and signs in', async () => {
    const tx = mockTx();
    expect(await activateAction('token', validData)).toBeNull();

    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { passwordHash: expect.any(String), tokenVersion: { increment: 1 } },
    });
    // Stored value must be a bcrypt hash, never the plain password
    expect(tx.staff.update.mock.calls[0][0].data.passwordHash).not.toBe(validData.password);
    expect(tx.activationToken.deleteMany).toHaveBeenCalledWith({ where: { staffId: 'staff-1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(mockSignIn).toHaveBeenCalledWith(
      'credentials',
      expect.objectContaining({ email: staff.email })
    );
  });
});
