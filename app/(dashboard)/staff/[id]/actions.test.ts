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
    staff: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    divisionEntityPermission: { findFirst: vi.fn() },
    divisionFieldPermission: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/activation', () => ({
  ACTIVATION_TOKEN_DAYS: 30,
  issueActivationToken: vi.fn().mockResolvedValue('raw-token'),
}));
vi.mock('@/lib/mail/mailer', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendMail } from '@/lib/mail/mailer';
import type { StaffUpdateSchema } from '@/validations/staff';
import {
  updateStaff,
  deleteStaff,
  sendInvite,
  resetPassword,
  setPasswordManually,
  changeRole,
} from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockFieldPerms = db.divisionFieldPermission.findMany as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockStaffCount = db.staff.count as unknown as Mock;
const mockSendMail = sendMail as unknown as Mock;

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
  adminPosition: 'DEAN',
  basicEducationMatch: true,
  basicEducationSpecialty: 'Історія',
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
    staffDepartment: { deleteMany: vi.fn(), createMany: vi.fn() },
    activationToken: { deleteMany: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // no active template → syncProfileDerived no-ops
    ratingTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
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

  // Division decides an editor's permission scope, so writing it is escalation:
  // grant it once and any editor could move themselves into ННВ.
  it('EDITOR never writes divisionId, even if the grant row exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffFind.mockResolvedValue({ divisionId: 'div-1' });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'academicRank' }, { fieldName: 'divisionId' }]);
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx)).toEqual(['academicRank']);
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

  // Deleting the only admin who can actually log in leaves nobody able to
  // grant the role back — recoverable only by hand in the database
  it('refuses to delete the last admin who can still log in', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffFind.mockResolvedValue({ role: 'ADMIN' });
    mockStaffCount.mockResolvedValue(0); // no other activated admin
    expect(await deleteStaff('admin-last')).toEqual({
      error: 'Це єдиний активний адміністратор — спочатку призначте іншого',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('allows deleting an admin while another activated admin remains', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffFind.mockResolvedValue({ role: 'ADMIN' });
    mockStaffCount.mockResolvedValue(1);
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue(null);
    expect(await deleteStaff('admin-2')).toEqual({ redirectTo: '/staff' });
    expect(tx.staff.delete).toHaveBeenCalled();
  });

  it('counts only activated admins — an un-invited one cannot take over', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffFind.mockResolvedValue({ role: 'ADMIN' });
    mockStaffCount.mockResolvedValue(0);
    await deleteStaff('admin-last');
    expect(mockStaffCount).toHaveBeenCalledWith({
      where: { id: { not: 'admin-last' }, role: 'ADMIN', passwordHash: { not: null } },
    });
  });
});

// ─── Account actions ─────────────────────────────────────────────────────────

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: 'admin-1' } };
const editorSession = { user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } };

const person = {
  id: 'staff-1',
  email: 'kovalenko@university.edu.ua',
  lastName: 'Коваленко',
  firstName: 'Іван',
  patronymic: 'Петрович',
};

describe('sendInvite', () => {
  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await sendInvite('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('rejects an already activated account', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue({ ...person, passwordHash: 'hash' });
    expect(await sendInvite('staff-1')).toEqual({ error: 'Обліковий запис вже активовано' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('emails an activation link to the staff email', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue({ ...person, passwordHash: null });
    expect(await sendInvite('staff-1')).toEqual({
      success: true,
      message: 'Запрошення надіслано',
    });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: person.email }));
    expect(mockSendMail.mock.calls[0][0].text).toContain('/activate/raw-token');
  });
});

describe('resetPassword', () => {
  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await resetPassword('staff-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('clears the hash, kills sessions, audits and emails a reset link', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue(person);
    const tx = mockTx();
    expect(await resetPassword('staff-1')).toEqual({
      success: true,
      message: 'Пароль скинуто, лист надіслано',
    });
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { passwordHash: null, tokenVersion: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  // Clearing the hash first would leave them with no password AND no link
  it('keeps the old password when the mail cannot be sent', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue(person);
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
    const tx = mockTx();

    expect(await resetPassword('staff-1')).toEqual({
      error: 'Не вдалося надіслати лист. Пароль не скинуто',
    });
    expect(tx.staff.update).not.toHaveBeenCalled();
  });
});

describe('setPasswordManually', () => {
  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(
      await setPasswordManually('staff-1', { password: 'password1', confirmPassword: 'password1' })
    ).toEqual({ error: 'Недостатньо прав' });
  });

  it('rejects a short or mismatched password', async () => {
    mockAuth.mockResolvedValue(adminSession);
    expect(
      await setPasswordManually('staff-1', { password: 'short', confirmPassword: 'short' })
    ).toEqual({ error: 'Некоректні дані' });
    expect(
      await setPasswordManually('staff-1', { password: 'password1', confirmPassword: 'password2' })
    ).toEqual({ error: 'Некоректні дані' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('sets the hash, consumes the token, kills sessions and audits', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue(person);
    const tx = mockTx();
    expect(
      await setPasswordManually('staff-1', { password: 'password1', confirmPassword: 'password1' })
    ).toEqual({ success: true, message: 'Пароль встановлено' });
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
    });
    expect(tx.activationToken.deleteMany).toHaveBeenCalledWith({ where: { staffId: 'staff-1' } });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});

describe('changeRole', () => {
  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await changeRole('staff-1', { role: 'EDITOR' })).toEqual({
      error: 'Недостатньо прав',
    });
  });

  it('rejects changing your own role', async () => {
    mockAuth.mockResolvedValue(adminSession);
    expect(await changeRole('admin-1', { role: 'USER' })).toEqual({
      error: 'Не можна змінити власну роль',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses to demote the last admin who can still log in', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue({ ...person, role: 'ADMIN' });
    mockStaffCount.mockResolvedValue(0);
    expect(await changeRole('staff-1', { role: 'EDITOR' })).toEqual({
      error: 'Це єдиний активний адміністратор — спочатку призначте іншого',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('allows demoting an admin while another activated admin remains', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue({ ...person, role: 'ADMIN' });
    mockStaffCount.mockResolvedValue(1);
    const tx = mockTx();
    expect(await changeRole('staff-1', { role: 'EDITOR' })).toEqual({
      success: true,
      message: 'Роль змінено',
    });
    expect(tx.staff.update).toHaveBeenCalled();
  });

  it('promoting to ADMIN is never blocked by the guard', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue({ ...person, role: 'USER' });
    mockStaffCount.mockResolvedValue(0);
    const tx = mockTx();
    expect(await changeRole('staff-1', { role: 'ADMIN' })).toEqual({
      success: true,
      message: 'Роль змінено',
    });
    expect(tx.staff.update).toHaveBeenCalled();
  });

  it('updates the role, bumps tokenVersion and audits the change', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue({ ...person, role: 'USER' });
    const tx = mockTx();
    expect(await changeRole('staff-1', { role: 'EDITOR' })).toEqual({
      success: true,
      message: 'Роль змінено',
    });
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { role: 'EDITOR', tokenVersion: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: { role: { from: 'USER', to: 'EDITOR' } },
        }),
      })
    );
  });
});
