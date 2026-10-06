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
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/mail/invite', () => ({ issueAndEmailLink: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { issueAndEmailLink } from '@/lib/mail/invite';
import type { StaffCreateSchema } from '@/validations/staff';
import { createStaff } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockInvite = issueAndEmailLink as unknown as Mock;

const payload: StaffCreateSchema = {
  lastName: 'Франко',
  firstName: 'Іван',
  patronymic: 'Якович',
  email: 'ivan@univ.ua',
  phone: null,
  isNpp: false,
  employmentRate: null,
  pedagogicalExperience: null,
  position: null,
  academicTitle: null,
  honoraryTitles: [],
  adminPositions: [],
  candidateDegree: null,
  candidateSpecialty: null,
  candidateDefenceDate: null,
  doctorDegree: null,
  doctorSpecialty: null,
  doctorDefenceDate: null,
  candidateMatchesDepartment: null,
  doctorMatchesDepartment: null,
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

// The audit entry of a new person reads in words (2026-10-06): raw, a badge list
// went into the log as `["merited_teacher"]`, an empty one as «— →», and the
// rating's mirror columns appeared as keys nobody typed.
describe('createStaff audit entry', () => {
  it('prints badges and posts as words and leaves out the mirrors', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();
    await createStaff({
      ...payload,
      isNpp: true,
      departmentId: 'dep-1',
      position: 'DOCENT',
      honoraryTitles: ['merited_teacher'],
      adminPositions: ['VICE_DEAN'],
    });
    const changes = tx.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes.honoraryTitles).toEqual({ from: null, to: 'Заслужений вчитель' });
    expect(changes.adminPositions).toEqual({ from: null, to: 'Заступник декана' });
    expect(changes.position).toEqual({ from: null, to: 'Доцент' });
    expect(changes).not.toHaveProperty('academicRank');
    expect(changes).not.toHaveProperty('adminPosition');
    // An empty list is no change at all
    const empty = mockTx();
    await createStaff(payload);
    expect(empty.auditLog.create.mock.calls[0][0].data.changes).not.toHaveProperty(
      'honoraryTitles'
    );
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

// Creating the person and inviting them are two outcomes, and only one of them
// can be rolled back. A mail server that is down must never cost somebody the
// record they just filled in.
describe('createStaff invite on create', () => {
  it('does not send anything unless asked', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockTx();

    expect(await createStaff(payload)).toEqual({ redirectTo: '/staff/staff-new' });
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it('mails the new person when asked', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockTx();
    mockInvite.mockResolvedValue(undefined);

    expect(await createStaff(payload, { sendInvite: true })).toEqual({
      redirectTo: '/staff/staff-new',
    });
    expect(mockInvite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'staff-new', email: 'ivan@univ.ua', lastName: 'Франко' }),
      'invite'
    );
  });

  it('still creates the person when SMTP fails, and says so', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();
    mockInvite.mockRejectedValue(new Error('SMTP down'));

    const result = await createStaff(payload, { sendInvite: true });
    expect(tx.staff.create).toHaveBeenCalled();
    expect(result).toEqual({
      redirectTo: '/staff/staff-new',
      inviteWarning: 'Запис створено, але лист не надіслано. Надішліть запрошення ще раз',
    });
  });

  // An editor may create a record but has never been able to hand out an
  // account. The switch is hidden from them; this is the server saying no too.
  it('ignores the flag for an EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockTx();

    expect(await createStaff(payload, { sendInvite: true })).toEqual({
      redirectTo: '/staff/staff-new',
    });
    expect(mockInvite).not.toHaveBeenCalled();
  });
});
