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
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { StaffCreateSchema } from '@/validations/staff';
import { createStaff } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const payload: StaffCreateSchema = {
  lastName: 'Франко',
  firstName: 'Іван',
  patronymic: 'Якович',
  email: 'ivan@univ.ua',
  phone: null,
  isNpp: false,
  employmentRate: null,
  pedagogicalExperience: null,
  academicRank: null,
  scientificDegree: null,
  degreeMatchesDepartment: null,
  adminPosition: null,
  basicEducationMatch: null,
  basicEducationSpecialty: null,
  wosUrl: null,
  wosCitationCount: null,
  scopusUrl: null,
  scopusCitationCount: null,
  googleScholarUrl: null,
  googleScholarCitationCount: null,
  orcidId: null,
  departmentId: null,
  divisionId: null,
  partTimeDepartmentIds: [],
};

function mockTx() {
  const tx = {
    staff: { create: vi.fn().mockResolvedValue({ id: 'staff-new' }) },
    staffDepartment: { createMany: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // no active template → syncProfileDerived no-ops
    ratingTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createStaff authorization', () => {
  it('rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 's1' } });
    expect(await createStaff(payload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an EDITOR without the STAFF CREATE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue(null);
    expect(await createStaff(payload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('allows an EDITOR with the STAFF CREATE grant and audits', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    const tx = mockTx();
    expect(await createStaff(payload)).toEqual({ redirectTo: '/staff/staff-new' });
    expect(tx.staff.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});

// Creating a record must not be the way around the filter updateStaff applies:
// ставка is confidential and відділ decides an editor's own permission scope.
describe('createStaff field filtering', () => {
  const loaded: StaffCreateSchema = {
    ...payload,
    employmentRate: 0.75,
    divisionId: 'div-nnv',
  };

  function createdFields(tx: ReturnType<typeof mockTx>): string[] {
    return Object.keys(tx.staff.create.mock.calls[0][0].data);
  }

  it('drops employmentRate and divisionId for an EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    const tx = mockTx();

    expect(await createStaff(loaded)).toEqual({ redirectTo: '/staff/staff-new' });
    const fields = createdFields(tx);
    expect(fields).not.toContain('employmentRate');
    expect(fields).not.toContain('divisionId');
    // The ordinary data an editor is entitled to enter still goes in
    expect(fields).toContain('lastName');
    expect(fields).toContain('email');
  });

  it('keeps both for an ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();

    expect(await createStaff(loaded)).toEqual({ redirectTo: '/staff/staff-new' });
    const data = tx.staff.create.mock.calls[0][0].data;
    expect(data.employmentRate).toBe(0.75);
    expect(data.divisionId).toBe('div-nnv');
  });
});
