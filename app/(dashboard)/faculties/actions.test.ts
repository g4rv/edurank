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
    divisionEntityPermission: { findFirst: vi.fn() },
    faculty: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createFaculty, updateFaculty, deleteFaculty } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockFacultyFind = db.faculty.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const payload = { name: 'Факультет фінансів', deanId: null };

function mockTx() {
  const tx = {
    faculty: {
      create: vi.fn().mockResolvedValue({ id: 'fac-1' }),
      findUnique: vi.fn().mockResolvedValue({ name: 'Стара назва', deanId: null }),
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

describe('faculty actions authorization', () => {
  it('createFaculty rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 's1' } });
    expect(await createFaculty(payload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('updateFaculty rejects an EDITOR without the FACULTY UPDATE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue(null);
    expect(await updateFaculty('fac-1', payload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('createFaculty allows an EDITOR with the FACULTY CREATE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    const tx = mockTx();
    expect(await createFaculty(payload)).toEqual({ redirectTo: '/faculties' });
    expect(tx.faculty.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('deleteFaculty allows ADMIN and audits', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockFacultyFind.mockResolvedValue({
      name: 'Факультет',
      deanId: null,
      _count: { departments: 0 },
    });
    const tx = mockTx();
    expect(await deleteFaculty('fac-1')).toEqual({ redirectTo: '/faculties' });
    expect(tx.faculty.delete).toHaveBeenCalledWith({ where: { id: 'fac-1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('deleteFaculty refuses when the faculty still has departments', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockFacultyFind.mockResolvedValue({
      name: 'Факультет',
      deanId: null,
      _count: { departments: 3 },
    });
    expect(await deleteFaculty('fac-1')).toEqual({
      error: 'Неможливо видалити факультет, що має кафедри',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
