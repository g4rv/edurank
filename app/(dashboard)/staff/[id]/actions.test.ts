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
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { StaffUpdateSchema } from '@/validations/staff';
import { updateStaff, deleteStaff } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockFieldPerms = db.divisionFieldPermission.findMany as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

// Payload an attacker could send: touches confidential + non-granted fields
const fullPayload: StaffUpdateSchema = {
  lastName: 'Шевченко',
  firstName: 'Тарас',
  patronymic: 'Григорович',
  email: 'taras@univ.ua',
  phone: '+380501112233',
  isNpp: false,
  employmentRate: 0.25, // confidential — EDITOR/USER must never write it
  pedagogicalExperience: 30,
  academicRank: 'PROFESSOR',
  scientificDegree: 'DOCTOR',
  degreeMatchesDepartment: true,
  wosUrl: 'https://wos.example/1',
  wosCitationCount: 10,
  scopusUrl: null,
  scopusCitationCount: null,
  googleScholarUrl: null,
  googleScholarCitationCount: null,
  orcidId: '0000-0001-2345-6789',
  departmentId: null,
  divisionId: null,
  partTimeDepartmentIds: [],
};

function mockTx() {
  const tx = {
    staff: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    staffDepartment: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

function writtenFields(tx: ReturnType<typeof mockTx>): string[] {
  return Object.keys(tx.staff.update.mock.calls[0][0].data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateStaff field filtering', () => {
  it('rejects a USER editing someone else’s profile', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    expect(await updateStaff('staff-other', fullPayload)).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an EDITOR whose division lacks the STAFF UPDATE entity permission', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' }); // getEditorDivisionId
    mockEntityPerm.mockResolvedValue(null);
    expect(await updateStaff('staff-1', fullPayload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('EDITOR writes only granted fields — never employmentRate, even if granted', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    // employmentRate granted here on purpose: the confidential filter must still block it
    mockFieldPerms.mockResolvedValue([
      { fieldName: 'academicRank' },
      { fieldName: 'pedagogicalExperience' },
      { fieldName: 'employmentRate' },
    ]);
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual(['academicRank', 'pedagogicalExperience']);
  });

  it('USER edits own profile: only the whitelisted contact/profile fields', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    const tx = mockTx();

    expect(await updateStaff('staff-own', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual([
      'googleScholarUrl',
      'orcidId',
      'phone',
      'scopusUrl',
      'wosUrl',
    ]);
  });

  it('ADMIN writes all schema fields including employmentRate', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx)).toContain('employmentRate');
    expect(writtenFields(tx)).toContain('divisionId');
  });
});

describe('deleteStaff authorization', () => {
  it('rejects USER — even for their own record', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    expect(await deleteStaff('staff-own')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an EDITOR without the STAFF DELETE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue(null);
    expect(await deleteStaff('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('allows ADMIN: deletes and audits', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Франко',
      firstName: 'Іван',
      patronymic: 'Якович',
      email: 'ivan@univ.ua',
      phone: null,
      isNpp: true,
      academicRank: 'PROFESSOR',
      scientificDegree: 'DOCTOR',
      departmentId: 'dep-1',
      divisionId: null,
    });
    expect(await deleteStaff('staff-1')).toEqual({ redirectTo: '/staff' });
    expect(tx.staff.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
