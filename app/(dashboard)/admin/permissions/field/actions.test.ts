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
    divisionFieldPermission: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { setFieldPermission } from './actions';

const mockAuth = auth as unknown as Mock;
const mockUpsert = db.divisionFieldPermission.upsert as unknown as Mock;
const mockDeleteMany = db.divisionFieldPermission.deleteMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', staffId: null } });
});

describe('setFieldPermission', () => {
  it('rejects EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    expect(await setFieldPermission('div-1', 'phone', true)).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('never grants a confidential field, even to ADMIN', async () => {
    expect(await setFieldPermission('div-1', 'employmentRate', true)).toEqual({
      error: 'Невідоме поле',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejects a field name outside the whitelist', async () => {
    expect(await setFieldPermission('div-1', 'passwordHash', true)).toEqual({
      error: 'Невідоме поле',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('grants a whitelisted field', async () => {
    mockUpsert.mockResolvedValue({});
    expect(await setFieldPermission('div-1', 'academicRank', true)).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { divisionId_fieldName: { divisionId: 'div-1', fieldName: 'academicRank' } },
      create: { divisionId: 'div-1', fieldName: 'academicRank' },
      update: {},
    });
  });

  it('revokes a granted field', async () => {
    mockDeleteMany.mockResolvedValue({});
    expect(await setFieldPermission('div-1', 'academicRank', false)).toBeNull();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1', fieldName: 'academicRank' },
    });
  });
});
