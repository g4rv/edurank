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
    staff: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    divisionEntityPermission: { findFirst: vi.fn() },
    divisionFieldPermission: { findMany: vi.fn() },
    // activeYear(), read when сумісництво is removed so the кафедра it drops
    // an allocation from is the current one
    ratingTemplate: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/activation', () => ({
  INVITE_TOKEN_HOURS: 30 * 24,
  RESET_TOKEN_HOURS: 2,
  mintActivationToken: vi.fn(() => ({
    token: 'raw-token',
    tokenHash: 'raw-token-hash',
    expiresAt: new Date('2026-09-24T00:00:00Z'),
  })),
  storeActivationToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/mail/mailer', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/mail/allowance', () => ({
  mailAllowance: vi.fn().mockResolvedValue({ ok: true }),
  recordMailSent: vi.fn().mockResolvedValue(undefined),
  retryMessage: vi.fn(() => 'Лист уже надсилали. Спробуйте після 14:32'),
}));
// The real hash, watched: a refused hand-set password must never reach it
vi.mock('@/lib/auth/throttle', () => ({ unlockEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('bcryptjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('bcryptjs')>();
  return { ...real, hash: vi.fn(real.hash) };
});
// `parseRateSeeds` and the error classes stay real; only the database half is faked
vi.mock('@/lib/stake/seed-allocation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stake/seed-allocation')>()),
  seedAllocations: vi.fn().mockResolvedValue(null),
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { sendMail } from '@/lib/mail/mailer';
import { mailAllowance } from '@/lib/mail/allowance';
import { unlockEmail } from '@/lib/auth/throttle';
import { Prisma } from '@/lib/generated/prisma/client';
import { LimitRaiseNeeded, seedAllocations, type LimitRaise } from '@/lib/stake/seed-allocation';
import type { StaffUpdateSchema } from '@/validations/staff';
import { ACADEMIC_EDITABLE_FIELDS } from '@/lib/staff/editable-fields';
import { CERTIFICATE_FIELDS } from '@/lib/language-certificates/options';
import {
  updateStaff,
  archiveStaff,
  restoreStaff,
  deleteStaff,
  sendInvite,
  resetPassword,
  setPasswordManually,
  forceLogout,
  unlockLogin,
  changeRole,
} from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockFieldPerms = db.divisionFieldPermission.findMany as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockStaffCount = db.staff.count as unknown as Mock;
const mockStaffFirst = db.staff.findFirst as unknown as Mock;
const mockSeed = seedAllocations as unknown as Mock;
const mockSendMail = sendMail as unknown as Mock;
const mockAllowance = mailAllowance as unknown as Mock;
const mockHash = hash as unknown as Mock;

const NO_DIPLOMA_FIELDS = {
  issuedBy: null,
  series: null,
  number: null,
  issueDate: null,
  basicLevel: null,
  topic: null,
};

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
  position: 'PROFESSOR',
  academicTitle: 'PROFESSOR',
  honoraryTitles: [],
  adminPositions: ['DEAN'],
  degrees: [
    {
      ...NO_DIPLOMA_FIELDS,
      degree: 'doc_history',
      specialty: null,
      defenceDate: null,
      matchesDepartment: true,
    },
    {
      ...NO_DIPLOMA_FIELDS,
      degree: 'cand_history',
      specialty: null,
      defenceDate: null,
      matchesDepartment: true,
    },
  ],
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
  email = undefined as string | undefined,
  isNpp = true,
} = {}) {
  mockStaffFind.mockImplementation(async (args: { where?: { id?: string }; select?: object }) => {
    const select = (args?.select ?? {}) as Record<string, boolean>;
    if (select.divisionId) return { divisionId };
    return { id: args?.where?.id, role: targetRole, archivedAt, email, isNpp };
  });
}

function mockTx() {
  const tx = {
    staff: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      // Only `deleteStaff` (ADMIN) removes a row; archiving must never reach it
      delete: vi.fn().mockResolvedValue({}),
    },
    staffDepartment: { deleteMany: vi.fn(), createMany: vi.fn() },
    // Мін/Макс are per кафедра per year, and go the same way as the allocation
    // when the placement they were typed for is gone.
    staffStakeLimits: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    // The audit diff resolves сумісництво ids to кафедра names
    department: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    // Archiving a завідувач / декан takes the post away (2026-10-07)
    faculty: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    // Removing сумісництво drops that кафедра's allocation and re-sums the rate
    stakeAllocation: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      // The ставки of a кафедра whose kind changed — see the keep-the-rate rule
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    activationToken: { deleteMany: vi.fn().mockResolvedValue({}) },
    // The language certificates are rows of their own (owner, 2026-10-14)
    languageCertificate: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
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

// The two language certificates of «Освіта» (owner, 2026-10-14) — rows of their
// own, so they are lifted out of the Staff update and written to their table, under
// the same grants as every other field.
describe('updateStaff language certificates', () => {
  const english = {
    series: null,
    number: '123456',
    issuedBy: 'British Council',
    issuedOn: '2024-03-15',
  };
  const withEnglish = {
    ...fullPayload,
    isNpp: true,
    departmentId: 'dept-1',
    englishCertificate: english,
  } as unknown as StaffUpdateSchema;

  it('ADMIN writes a certificate to its own table, never to a Staff column', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-1', withEnglish)).toEqual({ success: true });
    expect(writtenFields(tx)).not.toContain('englishCertificate');
    expect(tx.languageCertificate.upsert).toHaveBeenCalledTimes(1);
    expect(tx.languageCertificate.upsert.mock.calls[0][0]).toMatchObject({
      where: { staffId_kind: { staffId: 'staff-1', kind: 'ENGLISH' } },
      create: {
        staffId: 'staff-1',
        kind: 'ENGLISH',
        number: '123456',
        issuedBy: 'British Council',
      },
    });
    const { changes } = tx.auditLog.create.mock.calls[0][0].data;
    expect(changes.englishCertificate).toEqual({
      from: null,
      to: '№ 123456 · British Council · 15.03.2024',
    });
  });

  it('leaves the certificates alone when the form did not carry them', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();

    expect(
      await updateStaff('staff-1', { ...fullPayload, isNpp: true, departmentId: 'dept-1' })
    ).toEqual({
      success: true,
    });
    expect(tx.languageCertificate.findMany).not.toHaveBeenCalled();
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
    expect(tx.languageCertificate.delete).not.toHaveBeenCalled();
  });

  it('deletes a certificate when the block was emptied', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    const tx = mockTx();
    tx.languageCertificate.findMany.mockResolvedValue([
      {
        id: 'c1',
        kind: 'ENGLISH',
        series: null,
        number: '123456',
        issuedOn: new Date('2024-03-15T00:00:00.000Z'),
        issuedBy: 'British Council',
        level: null,
        decisionNumber: null,
        decisionDate: null,
        fileKey: null,
        fileName: null,
      },
    ]);
    const emptied = {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      englishCertificate: { series: '', number: '', issuedBy: '', issuedOn: '' },
    } as unknown as StaffUpdateSchema;

    expect(await updateStaff('staff-1', emptied)).toEqual({ success: true });
    expect(tx.languageCertificate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
  });

  it('drops them for an administrative record, whoever saves', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups({ isNpp: false });
    const tx = mockTx();

    // `isNpp` stays false in the payload: this person is not an НПП.
    const payload = { ...withEnglish, isNpp: false } as unknown as StaffUpdateSchema;
    expect(await updateStaff('staff-1', payload)).toEqual({ success: true });
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
  });

  it('EDITOR writes one only with its own grant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'ukrainianCertificate' }]);
    const tx = mockTx();

    // The division holds the Ukrainian grant, not the English one.
    expect(await updateStaff('staff-1', withEnglish)).toEqual({
      error: 'Немає полів, доступних для редагування',
    });
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
  });

  it('EDITOR with the grant saves it — and it alone counts as something editable', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'englishCertificate' }]);
    const tx = mockTx();

    expect(await updateStaff('staff-1', withEnglish)).toEqual({ success: true });
    expect(tx.languageCertificate.upsert).toHaveBeenCalledTimes(1);
    // Nothing but the certificate was granted, so no Staff column is written.
    expect(writtenFields(tx)).toEqual([]);
  });

  it('an НПП saves their own through the same action', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-own', withEnglish)).toEqual({ success: true });
    expect(tx.languageCertificate.upsert).toHaveBeenCalledTimes(1);
  });

  it('refuses a half-filled certificate with «Невірні дані» and writes nothing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups();
    mockTx();

    const half = {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      englishCertificate: { series: 'EN', number: '', issuedBy: '', issuedOn: '' },
    } as unknown as StaffUpdateSchema;
    expect(await updateStaff('staff-1', half)).toEqual({ error: 'Невірні дані' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
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
      { fieldName: 'wosCitationCount' },
      { fieldName: 'pedagogicalExperience' },
      { fieldName: 'employmentRate' },
    ]);
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual(['pedagogicalExperience', 'wosCitationCount']);
  });

  // Division decides an editor's permission scope, so writing it is escalation:
  // grant it once and any editor could move themselves into ННВ.
  it('EDITOR never writes divisionId, even if the grant row exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([
      { fieldName: 'wosCitationCount' },
      { fieldName: 'divisionId' },
    ]);
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx)).toEqual(['wosCitationCount']);
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
    mockFieldPerms.mockResolvedValue([{ fieldName: 'position' }]);
    const tx = mockTx();
    // Stored value already equals what the form submits
    tx.staff.findUnique.mockResolvedValue({ position: fullPayload.position });

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(tx.staff.update).toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // Contacts, research links and citation counts, and since 2026-10-06 their
  // own academic info —
  // plus the five legacy mirrors derived from it. Never name, кафедра, ставка.
  it('USER edits own profile: only the whitelisted fields', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-own', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual(
      [
        'googleScholarUrl',
        'orcidId',
        'phone',
        'scopusUrl',
        'wosUrl',
        'wosCitationCount',
        'scopusCitationCount',
        'googleScholarCitationCount',
        // The two language certificates are in this list but are NOT Staff
        // columns: they are rows of their own, written beside the update.
        ...ACADEMIC_EDITABLE_FIELDS.filter(
          (field) => !(Object.values(CERTIFICATE_FIELDS) as string[]).includes(field)
        ),
        'academicRank',
        'scientificDegree',
        'degreeDefenceDate',
        'degreeMatchesDepartment',
        'adminPosition',
        // the best doctor- and candidate-level records of the list, written to
        // the old slots
        'candidateDegree',
        'candidateSpecialty',
        'candidateDefenceDate',
        'candidateMatchesDepartment',
        'doctorDegree',
        'doctorSpecialty',
        'doctorDefenceDate',
        'doctorMatchesDepartment',
        // the basic-education mirrors, from the list's «Базова освіта» entries
        'basicEducationMatch',
        'basicEducationSpecialty',
      ].sort()
    );
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
    mockFieldPerms.mockResolvedValue([{ fieldName: 'wosCitationCount' }]);
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
    mockFieldPerms.mockResolvedValue([{ fieldName: 'email' }, { fieldName: 'wosCitationCount' }]);
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
    expect(writtenFields(tx).sort()).toEqual(['email', 'wosCitationCount']);
  });

  // Their own row is theirs whatever their role: the field filters still apply
  // and role/divisionId stay unwritable, so this cannot escalate.
  it('allows an EDITOR editing their own record', async () => {
    editorWithEmailGrant();
    mockStaffLookups({ targetRole: 'EDITOR' });
    const tx = mockTx();

    expect(await updateStaff('staff-editor', fullPayload)).toEqual({ success: true });
    expect(writtenFields(tx).sort()).toEqual(['email', 'wosCitationCount']);
  });

  it('reports a missing record instead of pretending it saved', async () => {
    editorWithEmailGrant();
    mockStaffFind.mockResolvedValue(null);

    expect(await updateStaff('gone', fullPayload)).toEqual({ error: 'Запис не знайдено' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// The same address in another case is the same address (2026-10-08). `@unique`
// cannot say so — Postgres compares case-sensitively — so the action does.
describe('updateStaff email', () => {
  const adminEdits = () =>
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });

  it('refuses an address another person holds, in any case', async () => {
    adminEdits();
    mockStaffLookups({ email: 'old@univ.ua' });
    mockStaffFirst.mockResolvedValueOnce({ id: 'someone-else' });

    const result = await updateStaff('staff-1', { ...fullPayload, email: 'Taken@Univ.UA' });

    expect(result).toEqual({ error: 'Працівник з таким email вже існує', field: 'email' });
    expect(mockTransaction).not.toHaveBeenCalled();
    // Looked up on the folded spelling, and never matching the person themself
    expect(mockStaffFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { equals: 'taken@univ.ua', mode: 'insensitive' },
          id: { not: 'staff-1' },
        }),
      })
    );
  });

  it('saves a free address in lower case', async () => {
    adminEdits();
    mockStaffLookups({ email: 'old@univ.ua' });
    mockStaffFirst.mockResolvedValueOnce(null);
    const tx = mockTx();

    expect(await updateStaff('staff-1', { ...fullPayload, email: 'New@Univ.UA' })).toEqual({
      success: true,
    });
    expect(tx.staff.update.mock.calls[0][0].data.email).toBe('new@univ.ua');
  });

  // The 2026-08-31 regression: saving a phone number rewrote an address nobody
  // touched, and the audit log filed it as the admin's edit. A stored address
  // that differs from the submitted one only in case is left exactly as it is.
  it('leaves a stored address alone when only its case differs', async () => {
    adminEdits();
    mockStaffLookups({ email: 'Ivan.Petrenko@univ.ua' });
    const tx = mockTx();

    expect(
      await updateStaff('staff-1', { ...fullPayload, email: 'IVAN.PETRENKO@univ.ua' })
    ).toEqual({ success: true });

    expect(writtenFields(tx)).not.toContain('email');
    expect(tx.auditLog.create.mock.calls[0][0].data.changes).not.toHaveProperty('email');
    // No duplicate hunt either: the only match would be the person themself
    expect(mockStaffFirst).not.toHaveBeenCalled();
  });
});

// A person is archived, not deleted — except by an ADMIN, who may remove a row
// outright (owner, 2026-10-08). Archiving cannot fix a duplicate: the second
// row is archived and still holds the address.
describe('deleteStaff', () => {
  const adminDeletes = () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'admin-1' } });
  };
  // Two layers (owner, 2026-10-08): archive first — the bin — then delete.
  const inTheBin = new Date('2026-01-01');

  it('removes the row, with an audit entry that names the address', async () => {
    adminDeletes();
    mockStaffLookups({
      targetRole: 'USER',
      archivedAt: inTheBin,
      email: 'Vasyl.Bondarchuk@uhsp.edu.ua',
    });
    const tx = mockTx();

    expect(await deleteStaff('staff-1')).toEqual({ success: true, message: 'Запис видалено' });

    expect(tx.staff.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
    const entry = tx.auditLog.create.mock.calls[0][0].data;
    expect(entry).toMatchObject({ action: 'DELETE', entity: 'Staff', entityId: 'staff-1' });
    expect(entry.changes).toEqual({
      email: { from: 'Vasyl.Bondarchuk@uhsp.edu.ua', to: null },
    });
  });

  // The second layer of safety: a mis-click on an active person cannot lose
  // their history, because the button is not there and the action says no.
  it('refuses a person who is not archived yet — the bin comes first', async () => {
    adminDeletes();
    mockStaffLookups({ targetRole: 'USER', archivedAt: null });
    const tx = mockTx();

    expect(await deleteStaff('staff-1')).toEqual({
      error: 'Спершу архівуйте запис — видалити можна лише з архіву',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.staff.delete).not.toHaveBeenCalled();
  });

  it('is for an ADMIN only — an editor holding STAFF DELETE may archive, not delete', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockStaffLookups({ targetRole: 'USER' });

    expect(await deleteStaff('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects a USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-1' } });

    expect(await deleteStaff('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an ADMIN deleting their own record', async () => {
    adminDeletes();
    mockStaffLookups({ targetRole: 'ADMIN' });

    expect(await deleteStaff('admin-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('takes the post away first, so the кафедра does not point at nobody', async () => {
    adminDeletes();
    mockStaffLookups({ targetRole: 'USER', archivedAt: inTheBin });
    const tx = mockTx();
    tx.department.findMany.mockResolvedValue([{ id: 'dep-1', name: 'Кафедра менеджменту' }]);

    expect(await deleteStaff('staff-1')).toEqual({
      success: true,
      message: 'Запис видалено. Без керівника: «Кафедра менеджменту»',
    });
    expect(tx.department.update).toHaveBeenCalledWith({
      where: { id: 'dep-1' },
      data: { headId: null },
    });
  });

  it('reports a missing record', async () => {
    adminDeletes();
    mockStaffFind.mockResolvedValue(null);

    expect(await deleteStaff('gone')).toEqual({ error: 'Запис не знайдено' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ScienceWork.createdBy and ScienceRecordFile.uploadedBy are required
  // relations: a person who authored a work cannot be deleted without orphaning
  // its co-authors' records, and the database says so.
  it('says why, and leaves the record in the archive, when the person authored a science work', async () => {
    adminDeletes();
    mockStaffLookups({ targetRole: 'USER', archivedAt: inTheBin });
    mockTx();
    mockTransaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' })
    );

    expect(await deleteStaff('staff-1')).toEqual({
      error:
        'Видалити не вдалося: за цією людиною закріплені наукові роботи чи файли. Запис залишається в архіві',
    });
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

  // Nobody archives themselves, an ADMIN included (owner, 2026-10-05). Plenty
  // of other admins, so it is THIS rule refusing, not the last-admin guard.
  it('refuses an ADMIN archiving their own record', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'admin-1' } });
    mockStaffLookups({ targetRole: 'ADMIN' });
    mockStaffCount.mockResolvedValue(5);

    expect(await archiveStaff('admin-1', '')).toEqual({ error: 'Недостатньо прав' });
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

  // Two ways an ADMIN row can exist and still be unable to sign in, and both
  // have to be discounted or this guard defeats itself:
  //
  //   never activated — `passwordHash` is null, and only another admin could
  //                     invite them;
  //   archived        — `authorize` refuses them, but `archiveStaff` leaves
  //                     `passwordHash` in place, so the row goes on looking
  //                     like a working login forever. Missing this let the
  //                     SECOND of two admins be archived after the first
  //                     (2026-08-28).
  it('counts only admins who can actually sign in — not un-invited, not archived', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockStaffLookups({ targetRole: 'ADMIN' });
    mockStaffCount.mockResolvedValue(0);
    await archiveStaff('admin-last', '');
    expect(mockStaffCount).toHaveBeenCalledWith({
      where: {
        id: { not: 'admin-last' },
        role: 'ADMIN',
        passwordHash: { not: null },
        archivedAt: null,
      },
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

  // The кафедра kept pointing at an account that cannot sign in, and its edit
  // page showed the id in place of a name (owner, 2026-10-07).
  it('takes the post away from a завідувач and says which кафедра is left without one', async () => {
    adminArchives();
    mockStaffLookups({ targetRole: 'USER' });
    const tx = mockTx();
    tx.department.findMany.mockResolvedValue([{ id: 'dep-1', name: 'Кафедра менеджменту' }]);

    const result = await archiveStaff('staff-1', '');
    expect(result).toEqual({
      success: true,
      message: 'Запис архівовано. Без керівника: «Кафедра менеджменту»',
    });
    expect(tx.department.update).toHaveBeenCalledWith({
      where: { id: 'dep-1' },
      data: { headId: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: 'Department',
          changes: { headId: { from: 'staff-1', to: null } },
        }),
      })
    );
    expect(tx.faculty.update).not.toHaveBeenCalled();
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

/**
 * The target's role, the caller's division switches, and the person's own data
 * all come through db.staff.findUnique — dispatch on `select` so a test does
 * not depend on call order.
 */
function mockAccountLookups({
  targetRole = 'USER',
  flags = {} as Partial<Record<'canInviteStaff' | 'canSetPasswords' | 'canEndSessions', boolean>>,
  passwordHash = null as string | null,
  archivedAt = null as Date | null,
} = {}) {
  mockStaffFind.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
    const select = args?.select ?? {};
    if ('division' in select) {
      return {
        division: {
          canInviteStaff: false,
          canSetPasswords: false,
          canEndSessions: false,
          ...flags,
        },
      };
    }
    return { ...person, role: targetRole, passwordHash, archivedAt };
  });
}

describe('account actions for an EDITOR with division switches', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(editorSession);
    mockAllowance.mockResolvedValue({ ok: true });
  });

  it('sendInvite: refused without the switch', async () => {
    mockAccountLookups({ flags: {} });
    expect(await sendInvite('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sendInvite: allowed with the switch, and checks the allowance', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true } });
    expect(await sendInvite('staff-1')).toEqual({ success: true, message: 'Запрошення надіслано' });
    expect(mockAllowance).toHaveBeenCalledWith('staff-1');
  });

  it('sendInvite: says when to try again if the allowance is spent', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true } });
    mockAllowance.mockResolvedValue({ ok: false, retryAt: new Date('2026-10-12T11:32:00Z') });
    expect(await sendInvite('staff-1')).toEqual({
      error: 'Лист уже надсилали. Спробуйте після 14:32',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sendInvite: ADMIN is never limited', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAccountLookups({});
    await sendInvite('staff-1');
    expect(mockAllowance).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  it('resetPassword and setPasswordManually are one switch: «set pass»', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: 'hash' });
    mockTx();
    expect((await resetPassword('staff-1')) as object).toHaveProperty('success', true);
    // By hand only for somebody who never activated (owner, 2026-10-12)
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: null });
    expect(
      (await setPasswordManually('staff-1', {
        password: 'Parol123!',
        confirmPassword: 'Parol123!',
      })) as object
    ).toHaveProperty('success', true);

    mockAccountLookups({ flags: { canInviteStaff: true, canEndSessions: true } });
    expect(await resetPassword('staff-1')).toEqual({ error: 'Недостатньо прав' });
    expect(
      await setPasswordManually('staff-1', { password: 'Parol123!', confirmPassword: 'Parol123!' })
    ).toEqual({ error: 'Недостатньо прав' });
  });

  // Owner, 2026-10-12: a hand-set password on an activated person would let the
  // editor sign in as them (a head, a dean...). They reset instead.
  const manualInput = { password: 'Parol123!', confirmPassword: 'Parol123!' };

  it('setPasswordManually: an editor is refused for an ACTIVATED person', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: 'hash' });
    const tx = mockTx();
    expect(await setPasswordManually('staff-1', manualInput)).toEqual({
      error:
        'Пароль вручну можна задати лише тому, хто ще не активував обліковий запис. Скористайтесь «Скинути пароль»',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.staff.update).not.toHaveBeenCalled();
    expect(mockHash).not.toHaveBeenCalled();
  });

  it('setPasswordManually: an editor may set it for a never-activated person', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: null });
    const tx = mockTx();
    expect(await setPasswordManually('staff-1', manualInput)).toEqual({
      success: true,
      message: 'Пароль встановлено',
    });
    expect(tx.staff.update).toHaveBeenCalled();
  });

  it('setPasswordManually: ADMIN may still set it for an activated person', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAccountLookups({ passwordHash: 'hash' });
    const tx = mockTx();
    expect(await setPasswordManually('staff-1', manualInput)).toEqual({
      success: true,
      message: 'Пароль встановлено',
    });
    expect(tx.staff.update).toHaveBeenCalled();
  });

  it('setPasswordManually: without the switch a never-activated person is still refused', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true }, passwordHash: null });
    const tx = mockTx();
    expect(await setPasswordManually('staff-1', manualInput)).toEqual({
      error: 'Недостатньо прав',
    });
    expect(tx.staff.update).not.toHaveBeenCalled();
  });

  it('resetPassword: sends nothing and clears nothing when the allowance is spent', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true }, passwordHash: 'hash' });
    mockAllowance.mockResolvedValue({ ok: false, retryAt: new Date('2026-10-12T11:32:00Z') });
    const tx = mockTx();
    expect(await resetPassword('staff-1')).toEqual({
      error: 'Лист уже надсилали. Спробуйте після 14:32',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(tx.staff.update).not.toHaveBeenCalled();
  });

  it('forceLogout: needs «end sessions»', async () => {
    mockAccountLookups({ flags: { canSetPasswords: true } });
    expect(await forceLogout('staff-1')).toEqual({ error: 'Недостатньо прав' });

    mockAccountLookups({ flags: { canEndSessions: true } });
    mockTx();
    expect(await forceLogout('staff-1')).toEqual({ success: true, message: 'Всі сесії завершено' });
  });

  it('forceLogout: bumps tokenVersion and audits it in one transaction', async () => {
    mockAccountLookups({ flags: { canEndSessions: true } });
    const tx = mockTx();
    await forceLogout('staff-1');
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'UPDATE',
        entity: 'Staff',
        entityId: 'staff-1',
        label: 'Коваленко Іван Петрович — завершено всі сесії',
        userId: editorSession.user.id,
      },
    });
  });

  it('sendInvite: audits the letter once it was accepted', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true } });
    expect(await sendInvite('staff-1')).toEqual({ success: true, message: 'Запрошення надіслано' });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'UPDATE',
        entity: 'Staff',
        entityId: 'staff-1',
        label: 'Коваленко Іван Петрович — запрошення надіслано',
        userId: editorSession.user.id,
      },
    });
  });

  it('sendInvite: no audit entry when the mail fails', async () => {
    mockAccountLookups({ flags: { canInviteStaff: true } });
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
    expect((await sendInvite('staff-1')) as object).toHaveProperty('error');
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  // The takeover. All three switches held, target is an admin or another editor.
  it.each(['ADMIN', 'EDITOR'] as const)(
    'refuses every action on a %s record',
    async (targetRole) => {
      mockAccountLookups({
        targetRole,
        flags: { canInviteStaff: true, canSetPasswords: true, canEndSessions: true },
      });
      const refused = { error: 'Недостатньо прав' };
      expect(await sendInvite('staff-1')).toEqual(refused);
      expect(await resetPassword('staff-1')).toEqual(refused);
      expect(
        await setPasswordManually('staff-1', {
          password: 'Parol123!',
          confirmPassword: 'Parol123!',
        })
      ).toEqual(refused);
      expect(await forceLogout('staff-1')).toEqual(refused);
      expect(mockSendMail).not.toHaveBeenCalled();
    }
  );

  it('a USER caller is refused', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'u1' } });
    mockAccountLookups({});
    expect(await forceLogout('staff-1')).toEqual({ error: 'Недостатньо прав' });
  });
});

// Owner, 2026-10-12: no credential action on an archived person — ADMIN included.
// An archived account cannot sign in, so a letter or a password is useless and a
// set password would outlive a restore.
describe('account actions on an ARCHIVED person', () => {
  const archivedMsg = 'Обліковий запис архівованої людини змінювати не можна. Спершу відновіть її';
  const archivedAt = new Date('2026-09-01T00:00:00Z');
  const allFlags = { canInviteStaff: true, canSetPasswords: true, canEndSessions: true };
  const manual = { password: 'Parol123!', confirmPassword: 'Parol123!' };

  const run: Array<[string, () => Promise<unknown>]> = [
    ['sendInvite', () => sendInvite('staff-1')],
    ['resetPassword', () => resetPassword('staff-1')],
    ['setPasswordManually', () => setPasswordManually('staff-1', manual)],
    ['forceLogout', () => forceLogout('staff-1')],
    ['unlockLogin', () => unlockLogin('staff-1')],
  ];

  function expectNothingHappened(tx: ReturnType<typeof mockTx>) {
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockAllowance).not.toHaveBeenCalled();
    expect(mockHash).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.staff.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(unlockEmail).not.toHaveBeenCalled();
  }

  it.each(run)('%s: ADMIN is refused, nothing is mailed or written', async (_name, call) => {
    mockAuth.mockResolvedValue(adminSession);
    mockAccountLookups({ archivedAt });
    const tx = mockTx();
    mockTransaction.mockClear();
    expect(await call()).toEqual({ error: archivedMsg });
    expectNothingHappened(tx);
  });

  it.each(run.filter(([n]) => n !== 'unlockLogin'))(
    '%s: an EDITOR holding the switch is refused the same way',
    async (_name, call) => {
      mockAuth.mockResolvedValue(editorSession);
      mockAccountLookups({ archivedAt, flags: allFlags });
      const tx = mockTx();
      mockTransaction.mockClear();
      expect(await call()).toEqual({ error: archivedMsg });
      expectNothingHappened(tx);
    }
  );

  it.each(run.filter(([n]) => n !== 'unlockLogin'))(
    '%s: an EDITOR without the switch still hears «Недостатньо прав»',
    async (_name, call) => {
      mockAuth.mockResolvedValue(editorSession);
      mockAccountLookups({ archivedAt, flags: {} });
      mockTx();
      expect(await call()).toEqual({ error: 'Недостатньо прав' });
    }
  );

  it('unlockLogin: a non-admin is refused before the person is read', async () => {
    mockAuth.mockResolvedValue(editorSession);
    mockAccountLookups({ archivedAt });
    expect(await unlockLogin('staff-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('unlockLogin: an active person is unlocked as before', async () => {
    mockAuth.mockResolvedValue(adminSession);
    mockAccountLookups({});
    expect(await unlockLogin('staff-1')).toEqual({ success: true, message: 'Блокування знято' });
    expect(unlockEmail).toHaveBeenCalledWith(person.email);
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

/**
 * Placing somebody on a second кафедра is structure, not money (owner,
 * 2026-08-26). It was ADMIN-only on the argument that сумісництво decides who
 * appears in a кафедра's ставка grid — but the money is guarded on its own:
 * `employmentRate` is confidential and grantable to nobody, and `/stakes/[id]`
 * refuses anybody who is not ADMIN, a head or a декан. So it becomes an
 * ordinary grantable field: ННВ may be given it, another відділ not.
 */
describe('updateStaff — сумісництво is a grantable field', () => {
  const withPartTime: StaffUpdateSchema = {
    ...fullPayload,
    isNpp: true,
    departmentId: 'dept-1',
    partTimeDepartmentIds: ['dept-2'],
  };

  function editor(grants: string[]) {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue(grants.map((fieldName) => ({ fieldName })));
    return mockTx();
  }

  it('ADMIN writes it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-1', withPartTime)).toEqual({ success: true });
    expect(tx.staffDepartment.createMany).toHaveBeenCalled();
  });

  it('an EDITOR granted the field writes it', async () => {
    const tx = editor(['wosCitationCount', 'partTimeDepartmentIds']);

    expect(await updateStaff('staff-1', withPartTime)).toEqual({ success: true });
    expect(tx.staffDepartment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ staffId: 'staff-1', departmentId: 'dept-2' }],
      })
    );
  });

  it('an EDITOR without the grant leaves сумісництво untouched', async () => {
    const tx = editor(['wosCitationCount']);

    expect(await updateStaff('staff-1', withPartTime)).toEqual({ success: true });
    expect(tx.staffDepartment.createMany).not.toHaveBeenCalled();
    // Not even cleared: the row belongs to somebody else's permission.
    expect(tx.staffDepartment.deleteMany).not.toHaveBeenCalled();
  });

  // The «no editable fields» guard counts scalar columns, and сумісництво is
  // not one of them — it lives in a join table and is written separately. A
  // division granted ONLY this field would otherwise be told it may edit
  // nothing, which is exactly the grant ADMIN just gave it.
  it('a division granted only this field may still save', async () => {
    const tx = editor(['partTimeDepartmentIds']);

    expect(await updateStaff('staff-1', withPartTime)).toEqual({ success: true });
    expect(tx.staffDepartment.createMany).toHaveBeenCalled();
  });
});

/**
 * Moving somebody between full-time and сумісник on the SAME кафедра.
 *
 * The 2026-08-24 rule dropped a кафедра's allocation when the person left it,
 * so «off the кафедра» and «paid by the кафедра» could not disagree. On
 * 2026-08-26 it was widened to a change of kind, because a 0,50 agreed while
 * somebody was full staff survived their move to a 0,25 сумісник ceiling and
 * the grid showed two numbers that disagreed.
 *
 * That cure deleted the head's ставка on the flip of a switch, silently — a
 * person who only had «Основне» turned off lost their rate (owner, 2026-10-08,
 * reported from production). **The rate is kept now, and the ceiling moves to
 * cover it** — the same way a typed ставка raises Макс. Only a кафедра the
 * person has actually LEFT stops paying them.
 */
describe('updateStaff — a placement that changes kind keeps its allocation', () => {
  function admin(existing: { departmentId: string | null; partTime: string[] }) {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });
    mockStaffLookups();
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Єрічева',
      firstName: 'Тамара',
      patronymic: 'Юріївна',
      departmentId: existing.departmentId,
      partTimeDepartments: existing.partTime.map((departmentId) => ({
        departmentId,
        department: { name: departmentId },
      })),
    });
    return tx;
  }

  /** Which кафедри the delete was told to spare — every one the person is still on. */
  function kept(tx: ReturnType<typeof mockTx>): string[] {
    const call = tx.stakeAllocation.deleteMany.mock.calls[0][0];
    return [...call.where.distribution.departmentId.notIn].sort();
  }

  it('keeps it when full-time becomes сумісник on the same кафедра', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: [] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: null,
      partTimeDepartmentIds: ['dept-1'],
    });

    expect(kept(tx)).toEqual(['dept-1']);
  });

  it('keeps it when сумісник becomes full-time on the same кафедра', async () => {
    const tx = admin({ departmentId: null, partTime: ['dept-1'] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      partTimeDepartmentIds: [],
    });

    expect(kept(tx)).toEqual(['dept-1']);
  });

  // Turning «Основне» on for the second row turns it off on the first, so both
  // кафедри change kind in one save — and both keep their ставка.
  it('keeps both when the main кафедра is swapped', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: ['dept-2'] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-2',
      partTimeDepartmentIds: ['dept-1'],
    });

    expect(kept(tx)).toEqual(['dept-1', 'dept-2']);
  });

  // The ceiling follows the rate, not the other way round: a 0,50 kept on a
  // кафедра that is now an additional one needs a Макс of 0,50, not 0,25.
  it('raises the new ceiling to cover a kept ставка that no longer fits', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: [] });
    tx.stakeAllocation.findMany.mockResolvedValue([
      { proposedHundredths: 50, distribution: { departmentId: 'dept-1' } },
    ]);

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: null,
      partTimeDepartmentIds: ['dept-1'],
    });

    expect(tx.stakeAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          staffId: 'staff-1',
          distribution: { year: 2026, departmentId: { in: ['dept-1'] } },
        },
      })
    );
    expect(tx.staffStakeLimits.upsert).toHaveBeenCalledWith({
      where: {
        staffId_departmentId_year: { staffId: 'staff-1', departmentId: 'dept-1', year: 2026 },
      },
      update: { maxHundredths: 50 },
      create: {
        staffId: 'staff-1',
        departmentId: 'dept-1',
        year: 2026,
        minHundredths: 10,
        maxHundredths: 50,
      },
    });
  });

  it('leaves the ceiling alone when the kept ставка fits the new one', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: [] });
    tx.stakeAllocation.findMany.mockResolvedValue([
      { proposedHundredths: 25, distribution: { departmentId: 'dept-1' } },
    ]);

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: null,
      partTimeDepartmentIds: ['dept-1'],
    });

    expect(tx.staffStakeLimits.upsert).not.toHaveBeenCalled();
  });

  // Full-time has the higher default ceiling, so there is nothing to raise going up.
  it('leaves the ceiling alone when сумісник becomes full-time', async () => {
    const tx = admin({ departmentId: null, partTime: ['dept-1'] });
    tx.stakeAllocation.findMany.mockResolvedValue([
      { proposedHundredths: 25, distribution: { departmentId: 'dept-1' } },
    ]);

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      partTimeDepartmentIds: [],
    });

    expect(tx.staffStakeLimits.upsert).not.toHaveBeenCalled();
  });

  it('does not look for ставки on a кафедра whose kind did not change', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: ['dept-2'] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      partTimeDepartmentIds: ['dept-2'],
    });

    expect(tx.stakeAllocation.findMany).not.toHaveBeenCalled();
  });

  // A Макс of 1,00 typed while somebody was full-time would otherwise survive
  // their move to сумісник, overriding the 0,10–0,25 fallback and leaving them
  // a full-time ceiling on a part-time post (owner, 2026-08-26).
  it('drops the Мін/Макс of a placement that changed kind', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: [] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: null,
      partTimeDepartmentIds: ['dept-1'],
    });

    expect(tx.staffStakeLimits.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ staffId: 'staff-1', departmentId: { notIn: [] } }),
      })
    );
  });

  it('keeps the Мін/Макс of a placement that did not change', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: ['dept-2'] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      partTimeDepartmentIds: ['dept-2'],
    });

    expect(tx.staffStakeLimits.deleteMany.mock.calls[0][0].where.departmentId.notIn.sort()).toEqual(
      ['dept-1', 'dept-2']
    );
  });

  // The cleanup used to live inside `if (canWritePartTime)`, which answers a
  // different question. `departmentId` is its own grant, so a division holding
  // only that one moved somebody's main кафедра and the кафедра they left went
  // on paying them (2026-08-27).
  it('runs for an EDITOR granted departmentId but NOT partTimeDepartmentIds', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'departmentId' }]);
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Іваненко',
      firstName: 'Петро',
      patronymic: 'Ігорович',
      departmentId: 'dept-1',
      partTimeDepartments: [],
    });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-2',
      partTimeDepartmentIds: [],
    });

    // dept-1 is left, so its allocation goes with it; dept-2 is where they are now
    expect(kept(tx)).toEqual(['dept-2']);
    expect(tx.staffStakeLimits.deleteMany).toHaveBeenCalled();
  });

  // Their сумісництво is untouched by such an editor, so those кафедри are
  // still theirs and must be spared — reading the payload instead of the stored
  // rows would delete a placement nobody changed.
  it('spares сумісництво an EDITOR without the grant could not have changed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'staff-editor' } });
    mockStaffLookups();
    mockEntityPerm.mockResolvedValue({ id: 'perm-1' });
    mockFieldPerms.mockResolvedValue([{ fieldName: 'departmentId' }]);
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Іваненко',
      firstName: 'Петро',
      patronymic: 'Ігорович',
      departmentId: 'dept-1',
      partTimeDepartments: [{ departmentId: 'dept-9', department: { name: 'dept-9' } }],
    });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      // The form cannot send this for them; whatever arrives must be ignored.
      partTimeDepartmentIds: [],
    });

    expect(kept(tx)).toEqual(['dept-1', 'dept-9']);
  });

  it('spares a placement whose kind did not change', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: ['dept-2'] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-1',
      partTimeDepartmentIds: ['dept-2'],
    });

    expect(kept(tx)).toEqual(['dept-1', 'dept-2']);
  });

  // The two rules meeting: one кафедра swaps kind, the other is simply left.
  it('drops only the кафедра that was left', async () => {
    const tx = admin({ departmentId: 'dept-1', partTime: ['dept-2'] });

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: 'dept-2',
      partTimeDepartmentIds: ['dept-3'],
    });

    // dept-1 was left; dept-2 changed kind and is kept; dept-3 is new
    expect(kept(tx)).toEqual(['dept-2', 'dept-3']);
  });
});

// ADMIN may type any ставка on the profile. One above the person's Макс is not
// refused: the form is asked, and the ceiling moves up only when they agree
// (owner, 2026-10-08). The server decides — a popup the client could skip would
// not be a guard.
describe('updateStaff — a ставка above the ceiling', () => {
  const raise: LimitRaise = {
    departmentId: 'dept-1',
    departmentName: 'Кафедра фінансів',
    fromHundredths: 100,
    toHundredths: 200,
  };
  const withRate = { rates: { 'dept-1': '2' } };

  function adminSaves() {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });
    mockStaffLookups();
    return mockTx();
  }

  it('asks before raising anything', async () => {
    adminSaves();
    mockSeed.mockRejectedValueOnce(new LimitRaiseNeeded([raise]));

    const result = await updateStaff('staff-1', fullPayload, withRate);

    expect(result).toEqual({ confirmRaise: [raise] });
    // Asked WITHOUT agreement — the server never assumes it
    expect(mockSeed.mock.calls[0][4]).toMatchObject({ raiseLimits: false });
  });

  it('raises the ceiling once agreed, and says so in the audit log', async () => {
    const tx = adminSaves();
    mockSeed.mockImplementationOnce(async (_tx, _id, _seeds, _year, opts) => {
      opts.raised.push(raise);
      return null;
    });

    const result = await updateStaff('staff-1', fullPayload, { ...withRate, confirmRaise: true });

    expect(result).toEqual({ success: true });
    expect(mockSeed.mock.calls[0][4]).toMatchObject({ raiseLimits: true });
    const changes = tx.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes.raisedLimits).toEqual({
      from: null,
      to: 'Кафедра фінансів — Макс 1,00 → 2,00',
    });
  });

  // A kept ставка that no longer fits after «Основне» was switched off moves the
  // ceiling too, and that is a change to somebody's bounds nobody else records.
  it('logs a ceiling raised to cover a ставка kept through a kind change', async () => {
    const tx = adminSaves();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Єрічева',
      firstName: 'Тамара',
      patronymic: 'Юріївна',
      departmentId: 'dept-1',
      partTimeDepartments: [],
    });
    tx.department.findMany.mockResolvedValue([{ id: 'dept-1', name: 'Кафедра фінансів' }]);
    tx.stakeAllocation.findMany.mockResolvedValue([
      { proposedHundredths: 50, distribution: { departmentId: 'dept-1' } },
    ]);

    await updateStaff('staff-1', {
      ...fullPayload,
      isNpp: true,
      departmentId: null,
      partTimeDepartmentIds: ['dept-1'],
    });

    const changes = tx.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes.raisedLimits).toEqual({
      from: null,
      to: 'Кафедра фінансів — Макс 0,25 → 0,50',
    });
  });

  it('logs nothing about ceilings when none moved', async () => {
    const tx = adminSaves();

    await updateStaff('staff-1', fullPayload);

    const changes = tx.auditLog.create.mock.calls[0]?.[0].data.changes ?? {};
    expect(changes).not.toHaveProperty('raisedLimits');
  });
});

// The rating still reads the old columns (2026-10-06): an ADMIN save of the
// new fields must keep them in step, or 1.2 / 1.3 / 1.6 would score the
// person's previous values.
describe('updateStaff — legacy mirrors', () => {
  it('writes academicRank, scientificDegree and adminPosition from the new fields', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'admin-1' } });
    mockStaffLookups();
    const tx = mockTx();

    expect(await updateStaff('staff-1', fullPayload)).toEqual({ success: true });
    expect(tx.staff.update.mock.calls[0][0].data).toMatchObject({
      position: 'PROFESSOR',
      academicRank: 'PROFESSOR',
      scientificDegree: 'DOCTOR',
      adminPosition: 'DEAN',
    });
  });
});

// A form that does not carry the academic fields (an old open tab, a narrower
// form) must not empty them with the schema's defaults (2026-10-06).
describe('updateStaff — writes only what was sent', () => {
  it('leaves academic fields alone when the payload did not include them', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'admin-1' } });
    mockStaffLookups();
    const tx = mockTx();
    const { position: _p, honoraryTitles: _h, adminPositions: _a, ...withoutSome } = fullPayload;

    await updateStaff('staff-1', withoutSome as StaffUpdateSchema);
    const written = writtenFields(tx);
    expect(written).not.toContain('position');
    expect(written).not.toContain('honoraryTitles');
    expect(written).not.toContain('adminPositions');
    expect(written).toContain('lastName');
  });
});
