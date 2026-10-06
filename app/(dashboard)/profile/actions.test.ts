import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { staff: { update: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('@/lib/rating/profile-derived', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rating/profile-derived')>()),
  syncProfileDerived: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { OwnProfileSchema } from '@/validations/staff';
import { syncProfileDerived } from '@/lib/rating/profile-derived';
import { updateOwnProfile } from './actions';

const mockAuth = auth as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

// Contacts only — what the form sent before academic info opened to НПП. Cast,
// because the parsed type now lists every academic field too.
const payload = {
  phone: '+380501112233',
  wosUrl: 'https://www.webofscience.com/wos/author/record/1',
  scopusUrl: null,
  googleScholarUrl: null,
  orcidId: '0000-0001-2345-6789',
} as unknown as OwnProfileSchema;

// What an НПП now fills in about themselves (owner, 2026-10-06).
const ACADEMIC = {
  pedagogicalExperience: 12,
  position: 'DOCENT',
  academicTitle: 'DOCENT',
  honoraryTitles: ['merited_teacher'],
  adminPositions: ['DEAN'],
  candidateDegree: 'cand_history',
  candidateSpecialty: 'Історія',
  candidateDefenceDate: '2015-06-01',
  doctorDegree: null,
  doctorSpecialty: null,
  doctorDefenceDate: null,
  degreeMatchesDepartment: true,
  basicEducationMatch: true,
  basicEducationSpecialty: 'Історія',
};

function mockTx() {
  const tx = {
    staff: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
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

describe('updateOwnProfile', () => {
  it('refuses a session with no staff record behind it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: null } });
    expect(await updateOwnProfile(payload)).toEqual({ error: 'Ваш профіль не знайдено' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // The whole point: it writes to whoever is signed in, never to an id from the
  // client, so there is no target to tamper with.
  it('writes to the signed-in person, and only the fields they own', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    const tx = mockTx();

    expect(await updateOwnProfile(payload)).toEqual({ success: true });
    expect(tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'staff-own' } })
    );
    expect(writtenFields(tx).sort()).toEqual([
      'googleScholarUrl',
      'orcidId',
      'phone',
      'scopusUrl',
      'wosUrl',
    ]);
  });

  // A forged payload carrying fields outside the whitelist must lose them, even
  // though the schema would already have stripped them.
  it('drops anything outside the fields a person owns', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    const tx = mockTx();

    await updateOwnProfile({
      ...payload,
      employmentRate: 2,
      role: 'ADMIN',
      departmentId: 'dep-x',
    } as unknown as OwnProfileSchema);

    const fields = writtenFields(tx);
    expect(fields).not.toContain('employmentRate');
    expect(fields).not.toContain('role');
    expect(fields).not.toContain('departmentId');
  });

  it('audits the change', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      phone: null,
      wosUrl: null,
      scopusUrl: null,
      googleScholarUrl: null,
      orcidId: null,
    });

    await updateOwnProfile(payload);
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('writes no audit row when nothing actually changed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      ...payload,
    });

    expect(await updateOwnProfile(payload)).toEqual({ success: true });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('updateOwnProfile — academic info (2026-10-06)', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
  });

  it('lets an НПП save it, keeps the rating’s old fields in step and re-scores', async () => {
    const tx = mockTx();
    expect(
      await updateOwnProfile({ ...payload, ...ACADEMIC } as unknown as OwnProfileSchema)
    ).toEqual({ success: true });

    const data = tx.staff.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      position: 'DOCENT',
      honoraryTitles: ['merited_teacher'],
      adminPositions: ['DEAN'],
      candidateDegree: 'cand_history',
      // the mirrors rating 1.2 / 1.3 / 1.6 read
      academicRank: 'DOCENT',
      scientificDegree: 'CANDIDATE',
      adminPosition: 'DEAN',
    });
    expect(data.degreeDefenceDate).toEqual(new Date(Date.UTC(2015, 5, 1)));
    expect(syncProfileDerived).toHaveBeenCalledWith(tx, 'staff-own');
  });

  // A save that does not carry the academic fields (an old open tab, the
  // contacts-only form) must not wipe them with the schema's empty defaults.
  it('leaves academic fields alone when the save did not send them', async () => {
    const tx = mockTx();
    await updateOwnProfile(payload);
    const fields = writtenFields(tx);
    expect(fields).not.toContain('position');
    expect(fields).not.toContain('honoraryTitles');
    expect(fields).not.toContain('academicRank');
    expect(syncProfileDerived).not.toHaveBeenCalled();
  });

  it('prints badges and degrees in words in the audit log', async () => {
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      honoraryTitles: [],
      adminPositions: [],
      candidateDegree: null,
      position: null,
    });
    await updateOwnProfile({ ...payload, ...ACADEMIC } as unknown as OwnProfileSchema);
    const changes = tx.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes.honoraryTitles).toEqual({ from: null, to: 'Заслужений вчитель' });
    expect(changes.candidateDegree).toEqual({ from: null, to: 'Кандидат історичних наук' });
    expect(changes.position).toEqual({ from: null, to: 'Доцент' });
    // The mirrors are bookkeeping, not something the person changed.
    expect(changes.academicRank).toBeUndefined();
  });
});
