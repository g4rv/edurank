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
    divisionFieldPermission: { findMany: vi.fn() },
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  canManageEntity,
  requireAdmin,
  getDivisionFieldGrants,
  CONFIDENTIAL_STAFF_FIELDS,
} from './permissions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockFieldPerms = db.divisionFieldPermission.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('canManageEntity', () => {
  it('always allows ADMIN', async () => {
    expect(await canManageEntity({ role: 'ADMIN', staffId: null }, 'STAFF', 'DELETE')).toBe(true);
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  it('never allows USER', async () => {
    expect(await canManageEntity({ role: 'USER', staffId: 'staff-1' }, 'STAFF', 'UPDATE')).toBe(
      false
    );
  });

  it('rejects an EDITOR without a division', async () => {
    mockStaffFind.mockResolvedValue({ divisionId: null });
    expect(await canManageEntity({ role: 'EDITOR', staffId: 'staff-1' }, 'STAFF', 'CREATE')).toBe(
      false
    );
  });

  it('rejects an EDITOR whose division lacks the permission', async () => {
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue(null);
    expect(await canManageEntity({ role: 'EDITOR', staffId: 'staff-1' }, 'FACULTY', 'DELETE')).toBe(
      false
    );
  });

  it('allows an EDITOR whose division holds the permission', async () => {
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    expect(await canManageEntity({ role: 'EDITOR', staffId: 'staff-1' }, 'FACULTY', 'CREATE')).toBe(
      true
    );
    expect(mockEntityPerm).toHaveBeenCalledWith({
      where: { divisionId: 'div-1', entity: 'FACULTY', action: 'CREATE' },
    });
  });
});

describe('requireAdmin', () => {
  it('redirects anonymous users to /login', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow('redirected');
  });

  it('returns null for non-admins', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    expect(await requireAdmin()).toBeNull();
  });

  it('returns the session for admins', async () => {
    const session = { user: { id: 'a1', role: 'ADMIN', staffId: null } };
    mockAuth.mockResolvedValue(session);
    expect(await requireAdmin()).toBe(session);
  });
});

describe('getDivisionFieldGrants', () => {
  it('returns granted field names as a set', async () => {
    mockFieldPerms.mockResolvedValue([{ fieldName: 'academicRank' }, { fieldName: 'phone' }]);
    expect(await getDivisionFieldGrants('div-1')).toEqual(new Set(['academicRank', 'phone']));
  });
});

describe('CONFIDENTIAL_STAFF_FIELDS', () => {
  it('contains employmentRate', () => {
    expect(CONFIDENTIAL_STAFF_FIELDS.has('employmentRate')).toBe(true);
  });
});
