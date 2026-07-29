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
  canMutateStaffRecord,
  requireAdmin,
  getDivisionFieldGrants,
  isEditorWritableField,
  CONFIDENTIAL_STAFF_FIELDS,
  PERMISSION_SCOPING_STAFF_FIELDS,
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

describe('isEditorWritableField', () => {
  it('allows ordinary staff fields', () => {
    for (const field of ['academicRank', 'phone', 'departmentId', 'pedagogicalExperience']) {
      expect(isEditorWritableField(field)).toBe(true);
    }
  });

  // Writing divisionId rewrites the writer's own permission scope: an editor
  // granted it could move themselves into ННВ and gain rating moderation.
  it('blocks divisionId — an editor could otherwise escalate themselves', () => {
    expect(PERMISSION_SCOPING_STAFF_FIELDS.has('divisionId')).toBe(true);
    expect(isEditorWritableField('divisionId')).toBe(false);
  });

  it('blocks confidential and account columns', () => {
    for (const field of ['employmentRate', 'passwordHash', 'role', 'tokenVersion']) {
      expect(isEditorWritableField(field)).toBe(false);
    }
  });
});

// The grants answer WHICH fields; this answers WHOSE record. Without it an
// editor able to write `email` could retarget an admin's address and take the
// account over through the public reset flow.
describe('canMutateStaffRecord', () => {
  const editor = { role: 'EDITOR' as const, staffId: 'staff-editor' };
  const admin = { role: 'ADMIN' as const, staffId: 'staff-admin' };
  const user = { role: 'USER' as const, staffId: 'staff-user' };

  it('lets an ADMIN act on anyone', () => {
    for (const role of ['ADMIN', 'EDITOR', 'USER'] as const) {
      expect(canMutateStaffRecord(admin, { id: 'other', role })).toBe(true);
    }
  });

  it('lets an EDITOR act on USER records only', () => {
    expect(canMutateStaffRecord(editor, { id: 'other', role: 'USER' })).toBe(true);
    expect(canMutateStaffRecord(editor, { id: 'other', role: 'EDITOR' })).toBe(false);
    expect(canMutateStaffRecord(editor, { id: 'other', role: 'ADMIN' })).toBe(false);
  });

  it('lets anyone act on their own record whatever their role', () => {
    expect(canMutateStaffRecord(editor, { id: 'staff-editor', role: 'EDITOR' })).toBe(true);
    expect(canMutateStaffRecord(user, { id: 'staff-user', role: 'USER' })).toBe(true);
  });

  it('withholds the self exception when the caller asks for it (deletion)', () => {
    expect(
      canMutateStaffRecord(editor, { id: 'staff-editor', role: 'EDITOR' }, { allowSelf: false })
    ).toBe(false);
  });

  // A USER reaching the action directly must not edit a peer just because the
  // peer is also a USER — the own-record branch is the only one open to them.
  it('refuses a USER acting on another USER', () => {
    expect(canMutateStaffRecord(user, { id: 'someone-else', role: 'USER' })).toBe(false);
  });

  it('refuses a caller with no staffId claiming the own-record exception', () => {
    expect(
      canMutateStaffRecord({ role: 'EDITOR', staffId: null }, { id: 'other', role: 'EDITOR' })
    ).toBe(false);
  });
});
