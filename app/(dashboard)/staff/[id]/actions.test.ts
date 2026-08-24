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
    // activeYear(), read when сумісництво is removed so the кафедра it drops
    // an allocation from is the current one
    ratingTemplate: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/activation', () => ({
  INVITE_TOKEN_HOURS: 30 * 24,
  RESET_TOKEN_HOURS: 2,
  issueActivationToken: vi.fn().mockResolvedValue('raw-token'),
}));
vi.mock('@/lib/mail/mailer', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendMail } from '@/lib/mail/mailer';
import type { StaffUpdateSchema } from '@/validations/staff';
import {
  updateStaff,
  archiveStaff,
  restoreStaff,
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
  degreeDefenceDate: null,
  academicRank: 'PROFESSOR',
  scientificDegree: 'DOCTOR',
  degreeMatchesDepartment: true,
  adminPosition: 'DEAN',
  basicEducationMatch: true,
  basicEducationSpecialty: 'Історія',
  wosUrl: 'https://www.webofscience.com/wos/author/record/1',
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

/**
 * db.staff.findUnique serves three lookups in these actions: the target's role
 * (canMutateStaffRecord), the caller's division (getEditorDivisionId) and the
 * target's role again (isLastActiveAdmin). Dispatch on the select so tests do
 * not depend on the order the action happens to call them in.
 */
function mockStaffLookups({
  targetRole = 'USER',
  divisionId = 'div-1' as string | null,
  archivedAt = null as Date | null,
} = {}) {
  mockStaffFind.mockImplementation(async (args: { where?: { id?: string }; select?: object }) => {
    const select = (args?.select ?? {}) as Record<string, boolean>;
    if (select.divisionId) return { divisionId };
    return { id: args?.where?.id, role: targetRole, archivedAt };
  });
}

function mockTx() {
  const tx = {
    staff: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      // No `delete`: a person is never hard-deleted any more, so a call would
      // fail here loudly instead of quietly passing a mock.
    },
    staffDepartment: { deleteMany: vi.fn(), createMany: vi.fn() },
    // The audit diff resolves сумісництво ids to кафедра names
    department: { findMany: vi.fn().mockResolvedValue([]) },
    // Removing сумісництво drops that кафедра's allocation and re-sums the rate
    stakeAllocation: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
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
  (db.ratingTemplate.findFirst as unknown as Mock).mockResolvedValue({ year: 2026 });
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
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue(null);
    expect(await updateStaff('staff-1', fullPayload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('EDITOR writes only granted fields — never employmentRate, even if granted', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
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
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'academicRank' }, { fieldName: 'divisionId' }]);
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx)).toEqual(['academicRank']);
  });

  // Without this the editor gets an empty UPDATE and a «Збережено» toast
  it('tells an EDITOR whose division has no usable grants that nothing is editable', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([]);

    expect(await updateStaff('staff-1', fullPayload)).toEqual({
      error: 'Немає полів, доступних для редагування',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('writes no audit row when an editor saves without changing anything', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'academicRank' }]);
    const tx = mockTx();
    // Stored value already equals what the form submits
    tx.staff.findUnique.mockResolvedValue({ academicRank: fullPayload.academicRank });

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(tx.staff.update).toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('USER edits own profile: only the whitelisted contact/profile fields', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    mockStaffLookups();
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

  it('ADMIN writes every schema field they own', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx)).toContain('divisionId');
    expect(writtenFields(tx)).toContain('academicRank');
  });

  // Was «ADMIN writes all schema fields including employmentRate» until
  // 2026-08-24. `saveDistribution` now owns that column — it is the sum across
  // every кафедра that pays this person — and the edit form shows it per
  // кафедра instead of asking for it. A profile save that still carried the
  // field would overwrite a ставка two завідувачі had agreed, and an empty
  // form field would NULL it.
  it('nobody writes employmentRate from a profile save, not even ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx)).not.toContain('employmentRate');
  });
});

// Сумісництво is written outside `updateData`, so `diffChanges` never saw it:
// an edit that only moved somebody's additional кафедра produced an audit row
// with an empty «Зміни» column. You could see that something changed and never
// what — and сумісництво now decides who appears in a second кафедра's ставка
// grid (2026-08-24).
describe('updateStaff records сумісництво in the audit log', () => {
  function auditChanges(tx: ReturnType<typeof mockTx>): Record<string, unknown> {
    return tx.auditLog.create.mock.calls[0][0].data.changes;
  }

  it('names the кафедра that was added', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({ partTimeDepartments: [] });
    tx.department.findMany.mockResolvedValue([{ name: 'Кафедра екології' }]);

    await updateStaff('staff-1', { ...fullPayload, partTimeDepartmentIds: ['d2'] });

    expect(auditChanges(tx).partTimeDepartmentIds).toEqual({
      from: null,
      to: 'Кафедра екології',
    });
  });

  it('names the кафедра that was removed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      partTimeDepartments: [{ department: { name: 'Кафедра екології' } }],
    });

    await updateStaff('staff-1', { ...fullPayload, partTimeDepartmentIds: [] });

    expect(auditChanges(tx).partTimeDepartmentIds).toEqual({
      from: 'Кафедра екології',
      to: null,
    });
  });

  it('says nothing when the сумісництво did not move', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      partTimeDepartments: [{ department: { name: 'Кафедра екології' } }],
    });
    tx.department.findMany.mockResolvedValue([{ name: 'Кафедра екології' }]);

    await updateStaff('staff-1', { ...fullPayload, partTimeDepartmentIds: ['d2'] });

    expect(auditChanges(tx)).not.toHaveProperty('partTimeDepartmentIds');
  });

  it('does not look at сумісництво for an EDITOR, who cannot change it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'academicRank' }]);
    const tx = mockTx();

    await updateStaff('staff-1', { ...fullPayload, partTimeDepartmentIds: ['d2'] });

    expect(tx.department.findMany).not.toHaveBeenCalled();
    expect(auditChanges(tx)).not.toHaveProperty('partTimeDepartmentIds');
  });
});

// The grants say which fields an editor may write, never whose record. Without
// a target check an editor holding `email` could point an admin's address at
// their own mailbox, run /forgot-password and come back as that admin.
describe('updateStaff target-role guard', () => {
  const editorWithEmailGrant = () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'email' }, { fieldName: 'academicRank' }]);
  };

  it('refuses an EDITOR editing an ADMIN, even with every grant', async () => {
    editorWithEmailGrant();
    mockStaffLookups({ targetRole: 'ADMIN' });

    expect(await updateStaff('admin-1', fullPayload)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an EDITOR editing another EDITOR', async () => {
    editorWithEmailGrant();
    mockStaffLookups({ targetRole: 'EDITOR' });

    expect(await updateStaff('staff-other-editor', fullPayload)).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('still allows an EDITOR editing an ordinary USER', async () => {
    editorWithEmailGrant();
    mockStaffLookups({ targetRole: 'USER' });
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual(['academicRank', 'email']);
  });

  // Their own row is theirs whatever their role: the field filters still apply
  // and role/divisionId stay unwritable, so this cannot escalate.
  it('allows an EDITOR editing their own record', async () => {
    editorWithEmailGrant();
    mockStaffLookups({ targetRole: 'EDITOR' });
    const tx = mockTx();

    expect(await updateStaff('staff-editor', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual(['academicRank', 'email']);
  });

  it('reports a missing record instead of pretending it saved', async () => {
    editorWithEmailGrant();
    mockStaffFind.mockResolvedValue(null);

    expect(await updateStaff('gone', fullPayload)).toEqual({ error: 'Запис не знайдено' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('archiveStaff authorization', () => {
  it('rejects USER — even for their own record', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    expect(await archiveStaff('staff-own', '')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an EDITOR without the STAFF DELETE grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue(null);
    expect(await archiveStaff('staff-1', '')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // STAFF DELETE says an editor may take staff off the roster, not whom: an
  // admin's row is off-limits however complete their division's permissions are.
  it('refuses an EDITOR archiving an ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockStaffLookups({ targetRole: 'ADMIN' });
    mockStaffCount.mockResolvedValue(5); // plenty of other admins — not the last-admin guard

    expect(await archiveStaff('admin-1', '')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an EDITOR archiving their own record', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockStaffLookups({ targetRole: 'EDITOR' });

    expect(await archiveStaff('staff-editor', '')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('still lets an EDITOR archive an ordinary USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockStaffLookups({ targetRole: 'USER' });
    const tx = mockTx();

    expect(await archiveStaff('staff-1', '')).toEqual({
      success: true,
      message: 'Запис архівовано',
    });
    expect(tx.staff.update).toHaveBeenCalled();
  });

  // Archiving blocks the login, so the last admin would lock the university out
  // exactly as deleting them used to.
  it('refuses to archive the last admin who can still log in', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups({ targetRole: 'ADMIN' });
    mockStaffCount.mockResolvedValue(0); // no other activated admin
    expect(await archiveStaff('admin-last', '')).toEqual({
      error: 'Це єдиний активний адміністратор — спочатку призначте іншого',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('counts only activated admins — an un-invited one cannot take over', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups({ targetRole: 'ADMIN' });
    mockStaffCount.mockResolvedValue(0);
    await archiveStaff('admin-last', '');
    expect(mockStaffCount).toHaveBeenCalledWith({
      where: { id: { not: 'admin-last' }, role: 'ADMIN', passwordHash: { not: null } },
    });
  });
});

describe('archiveStaff', () => {
  const adminArchives = () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffCount.mockResolvedValue(5);
  };

  // The whole point: a person leaves the roster, their record does not leave
  // the database. Nothing in here deletes anything.
  it('sets archivedAt with the reason and ends every open session', async () => {
    adminArchives();
    mockStaffLookups({ targetRole: 'USER' });
    const tx = mockTx();

    expect(await archiveStaff('staff-1', '  декретна відпустка до 2029  ')).toEqual({
      success: true,
      message: 'Запис архівовано',
    });

    const data = tx.staff.update.mock.calls[0][0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(data.archiveReason).toBe('декретна відпустка до 2029');
    // An archived account cannot sign in; a session open right now must end too
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('keeps an empty reason as null rather than an empty string', async () => {
    adminArchives();
    mockStaffLookups({ targetRole: 'USER' });
    const tx = mockTx();

    await archiveStaff('staff-1', '   ');
    expect(tx.staff.update.mock.calls[0][0].data.archiveReason).toBeNull();
  });

  it('refuses a reason longer than the column expects', async () => {
    adminArchives();
    mockStaffLookups({ targetRole: 'USER' });

    expect(await archiveStaff('staff-1', 'я'.repeat(501))).toEqual({
      error: 'Причина занадто довга (до 500 символів)',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses to archive someone who already is', async () => {
    adminArchives();
    mockStaffLookups({ targetRole: 'USER', archivedAt: new Date('2026-01-01') });

    expect(await archiveStaff('staff-1', '')).toEqual({ error: 'Запис вже архівовано' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('reports a missing record instead of pretending it archived', async () => {
    adminArchives();
    mockStaffFind.mockResolvedValue(null);

    expect(await archiveStaff('gone', '')).toEqual({ error: 'Запис не знайдено' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('restoreStaff', () => {
  it('clears the archive so the login and the rating work again', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups({ targetRole: 'USER', archivedAt: new Date('2026-01-01') });
    const tx = mockTx();

    expect(await restoreStaff('staff-1')).toEqual({
      success: true,
      message: 'Запис відновлено',
    });
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { archivedAt: null, archiveReason: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('refuses a record that is not archived', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups({ targetRole: 'USER' });

    expect(await restoreStaff('staff-1')).toEqual({ error: 'Запис не архівовано' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an EDITOR restoring an ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockStaffLookups({ targetRole: 'ADMIN', archivedAt: new Date('2026-01-01') });

    expect(await restoreStaff('admin-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
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
      await setPasswordManually('staff-1', { password: 'Parol123!', confirmPassword: 'Parol123!' })
    ).toEqual({ error: 'Недостатньо прав' });
  });

  it('rejects a short or mismatched password', async () => {
    mockAuth.mockResolvedValue(adminSession);
    expect(
      await setPasswordManually('staff-1', { password: 'short', confirmPassword: 'short' })
    ).toEqual({ error: 'Некоректні дані' });
    expect(
      await setPasswordManually('staff-1', { password: 'Parol123!', confirmPassword: 'Parol456!' })
    ).toEqual({ error: 'Некоректні дані' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('sets the hash, consumes the token, kills sessions and audits', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockStaffFind.mockResolvedValue(person);
    const tx = mockTx();
    expect(
      await setPasswordManually('staff-1', { password: 'Parol123!', confirmPassword: 'Parol123!' })
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
