import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn() },
    divisionEntityPermission: { findFirst: vi.fn() },
    department: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createDepartment, updateDepartment, deleteDepartment } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockDepartmentFind = db.department.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const payload = { name: 'Кафедра фінансів', facultyId: 'fac-1', headId: null };

function mockTx() {
  const tx = {
    department: {
      create: vi.fn().mockResolvedValue({ id: 'dep-1' }),
      findUnique: vi
        .fn()
        .mockResolvedValue({ name: 'Стара назва', facultyId: 'fac-1', headId: null }),
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

describe('department actions authorization', () => {
  it('createDepartment rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 's1' } });
    expect(await createDepartment(payload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('deleteDepartment rejects an EDITOR without the DEPARTMENT DELETE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue(null);
    expect(await deleteDepartment('dep-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('updateDepartment allows an EDITOR with the DEPARTMENT UPDATE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    const tx = mockTx();
    expect(await updateDepartment('dep-1', payload)).toEqual({ redirectTo: '/departments/dep-1' });
    expect(tx.department.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('deleteDepartment refuses when staff are still attached', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockDepartmentFind.mockResolvedValue({
      name: 'Кафедра',
      facultyId: 'fac-1',
      headId: null,
      _count: { primaryStaff: 2, partTimeStaff: 0 },
    });
    expect(await deleteDepartment('dep-1')).toEqual({
      error: 'Неможливо видалити кафедру, до якої прикріплений персонал',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
