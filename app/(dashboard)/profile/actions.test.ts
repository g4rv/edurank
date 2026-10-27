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
    staff: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ isNpp: true }) },
    $transaction: vi.fn(),
  },
}));
// The headship half of «one leading post» reads the database (2026-10-06).
vi.mock('@/lib/queries/scope', () => ({ adminPostsConflict: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/rating/profile-derived', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rating/profile-derived')>()),
  syncProfileDerived: vi.fn(),
}));
// A language certificate's scan is checked against R2 (owner, 2026-10-14).
vi.mock('@/lib/science/file-intake', () => ({
  verifyUploadedObject: vi.fn(),
  safeDeleteObject: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { OwnProfileSchema } from '@/validations/staff';
import { syncProfileDerived } from '@/lib/rating/profile-derived';
import { adminPostsConflict } from '@/lib/queries/scope';
import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
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

/** A diploma saved before its papers existed (owner, 2026-10-15) */
const NO_PAPERS = {
  issuedBy: null,
  series: null,
  number: null,
  issueDate: null,
  basicLevel: null,
  topic: null,
};

// What an НПП now fills in about themselves (owner, 2026-10-06).
const ACADEMIC = {
  pedagogicalExperience: 12,
  position: 'DOCENT',
  academicTitle: 'DOCENT',
  honoraryTitles: ['merited_teacher'],
  adminPositions: ['DEAN'],
  degrees: [
    {
      degree: 'cand_history',
      specialty: 'Історія',
      defenceDate: '2015-06-01',
      matchesDepartment: true,
      // the diploma's papers, mandatory for a new entry (owner, 2026-10-15)
      issuedBy: 'МОН України',
      series: 'ДК',
      number: '012345',
      issueDate: '2015-10-01',
      basicLevel: null,
      topic: 'Історія Слобожанщини',
    },
  ],
};

function mockTx() {
  const tx = {
    staff: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    // The language certificates are rows of their own (owner, 2026-10-14)
    languageCertificate: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // «Освіта» is rows of its own (owner, 2026-10-15)
    diploma: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      // Written in place since 2026-10-27 — none stored unless a test says so
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
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
      // the list's best candidate-level record, written to the old slot
      candidateDegree: 'cand_history',
      candidateSpecialty: 'Історія',
      // the mirrors rating 1.2 / 1.3 / 1.6 read
      academicRank: 'DOCENT',
      scientificDegree: 'CANDIDATE',
      adminPosition: 'DEAN',
    });
    expect(data.degreeDefenceDate).toEqual(new Date(Date.UTC(2015, 5, 1)));
    expect(syncProfileDerived).toHaveBeenCalledWith(tx, 'staff-own');

    // The diplomas are Diploma rows, never a Staff column (owner, 2026-10-15)
    expect(data).not.toHaveProperty('degrees');
    // A new entry is created; stored rows are written in place (2026-10-27)
    expect(tx.diploma.create.mock.calls.map((c: { data: unknown }[]) => c[0].data)).toEqual([
      expect.objectContaining({
        staffId: 'staff-own',
        position: 0,
        degree: 'cand_history',
        defenceDate: new Date(Date.UTC(2015, 5, 1)),
        issueDate: new Date(Date.UTC(2015, 9, 1)),
        number: '012345',
        topic: 'Історія Слобожанщини',
      }),
    ]);
  });

  // Not theirs to set (owner, 2026-10-16): ADMIN or a granted division does it.
  it('drops the науково-педагогічний стаж, though the rest saves', async () => {
    const tx = mockTx();
    expect(
      await updateOwnProfile({ ...payload, ...ACADEMIC } as unknown as OwnProfileSchema)
    ).toEqual({ success: true });

    const data = tx.staff.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('pedagogicalExperience');
    expect(data).toMatchObject({ position: 'DOCENT' });
  });

  // The guard behind the popup (owner, 2026-10-15)
  it('refuses a NEW diploma with a mandatory field empty, before anything is written', async () => {
    mockTx();
    const [entry] = ACADEMIC.degrees;
    const result = await updateOwnProfile({
      ...payload,
      ...ACADEMIC,
      degrees: [{ ...entry, number: null }],
    } as unknown as OwnProfileSchema);
    expect(result).toEqual({ error: 'Заповніть усі обов’язкові поля освіти. Зміни не збережено' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('lets an OLD incomplete diploma come back untouched, so a phone save still works', async () => {
    const tx = mockTx();
    (db.staff.findUnique as unknown as Mock).mockResolvedValue({
      isNpp: true,
      diplomas: [
        {
          position: 0,
          degree: 'cand_history',
          specialty: 'Історія',
          defenceDate: new Date(Date.UTC(2015, 5, 1)),
          matchesDepartment: true,
        },
      ],
    });
    const old = {
      ...NO_PAPERS,
      degree: 'cand_history',
      specialty: 'Історія',
      defenceDate: '2015-06-01',
      matchesDepartment: true,
    };
    expect(
      await updateOwnProfile({ ...payload, degrees: [old] } as unknown as OwnProfileSchema)
    ).toEqual({ success: true });
    expect(tx.diploma.create).toHaveBeenCalled();

    // …but CHANGING it — even only the «відповідає кафедрі» tick — asks for the papers
    expect(
      await updateOwnProfile({
        ...payload,
        degrees: [{ ...old, matchesDepartment: null }],
      } as unknown as OwnProfileSchema)
    ).toEqual({ error: 'Заповніть усі обов’язкові поля освіти. Зміни не збережено' });
    // the module mock's default, for the tests after this one
    (db.staff.findUnique as unknown as Mock).mockResolvedValue({ isNpp: true });
  });

  // One leading post at most, a headship counted (owner, 2026-10-06): a
  // завідувач who also picks «Керівник відділу» is refused before any write.
  it('refuses a second leading post beside a headship', async () => {
    const tx = mockTx();
    (adminPostsConflict as Mock).mockResolvedValueOnce('Керівна посада може бути лише одна');
    expect(
      await updateOwnProfile({
        ...payload,
        ...ACADEMIC,
        adminPositions: ['UNIT_HEAD'],
      } as unknown as OwnProfileSchema)
    ).toEqual({ error: 'Керівна посада може бути лише одна' });
    expect(adminPostsConflict).toHaveBeenCalledWith('staff-own', ['UNIT_HEAD']);
    expect(tx.staff.update).not.toHaveBeenCalled();
  });

  // The form draws these for an НПП only; a hand-made request from an
  // administrative account must not give itself a посада or a ступінь.
  it('drops academic fields for somebody who is not an НПП', async () => {
    (db.staff.findUnique as Mock).mockResolvedValueOnce({ isNpp: false });
    const tx = mockTx();
    await updateOwnProfile({ ...payload, ...ACADEMIC } as unknown as OwnProfileSchema);
    const fields = writtenFields(tx);
    expect(fields).toContain('phone');
    expect(fields).not.toContain('position');
    expect(fields).not.toContain('adminPositions');
    expect(fields).not.toContain('academicRank');
  });

  // Administrative staff keep their phone and nothing else (owner, 2026-10-10).
  it('drops the research profiles for somebody who is not an НПП', async () => {
    (db.staff.findUnique as Mock).mockResolvedValueOnce({ isNpp: false });
    const tx = mockTx();
    await updateOwnProfile({
      ...payload,
      scopusCitationCount: 7,
    } as unknown as OwnProfileSchema);
    expect(writtenFields(tx)).toEqual(['phone']);
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
    // (It may still re-score: the profile links feed the citation indicators.)
  });

  it('prints badges and degrees in words in the audit log', async () => {
    const tx = mockTx();
    tx.staff.findUnique.mockResolvedValue({
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      honoraryTitles: [],
      adminPositions: [],
      diplomas: [],
      position: null,
    });
    await updateOwnProfile({ ...payload, ...ACADEMIC } as unknown as OwnProfileSchema);
    const changes = tx.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes.honoraryTitles).toEqual({ from: null, to: 'Заслужений вчитель' });
    expect(changes.degrees).toEqual({
      from: null,
      to:
        'Кандидат історичних наук · Історія · тема: Історія Слобожанщини · 01.06.2015 · ' +
        'Видав МОН України · серія ДК № 012345 · від 01.10.2015 · відповідає кафедрі',
    });
    // The six old columns are bookkeeping too.
    expect(changes.candidateDegree).toBeUndefined();
    expect(changes.position).toEqual({ from: null, to: 'Доцент' });
    // The mirrors are bookkeeping, not something the person changed.
    expect(changes.academicRank).toBeUndefined();
  });
});

// The two language certificates of «Освіта» (owner, 2026-10-14): rows of their own
// — never Staff columns — written with the person's own save, scan and all.
describe('updateOwnProfile — language certificates', () => {
  const english = {
    series: 'EN',
    number: '123',
    issuedBy: 'British Council',
    issuedOn: '2024-03-15',
  };
  const withEnglish = { ...payload, englishCertificate: english } as unknown as OwnProfileSchema;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    // NB: `db.staff.findUnique` (the НПП check) answers {isNpp: true} by default.
    (db.staff.findUnique as unknown as Mock).mockResolvedValue({ isNpp: true });
  });

  it('writes the certificate to its own table, and never to a Staff column', async () => {
    const tx = mockTx();
    expect(await updateOwnProfile(withEnglish)).toEqual({ success: true });

    expect(writtenFields(tx)).not.toContain('englishCertificate');
    expect(tx.languageCertificate.upsert.mock.calls[0][0]).toMatchObject({
      where: { staffId_kind: { staffId: 'staff-own', kind: 'ENGLISH' } },
      create: { staffId: 'staff-own', kind: 'ENGLISH', series: 'EN', number: '123' },
    });
    const changes = tx.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes.englishCertificate).toEqual({
      from: null,
      to: 'EN № 123 · British Council · 15.03.2024',
    });
  });

  it('drops them for somebody who is not an НПП', async () => {
    (db.staff.findUnique as unknown as Mock).mockResolvedValue({ isNpp: false });
    const tx = mockTx();
    await updateOwnProfile(withEnglish);
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
    // An administrative account keeps its phone and nothing else.
    expect(writtenFields(tx)).toEqual(['phone']);
  });

  it('leaves them alone when the save did not carry them', async () => {
    const tx = mockTx();
    await updateOwnProfile(payload);
    expect(tx.languageCertificate.findMany).not.toHaveBeenCalled();
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
  });

  it('refuses a half-filled certificate', async () => {
    mockTx();
    const half = {
      ...payload,
      ukrainianCertificate: { number: '777', level: '', issuedOn: '' },
    } as unknown as OwnProfileSchema;
    expect(await updateOwnProfile(half)).toEqual({ error: 'Невірні дані' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a staged scan that is in somebody else’s folder', async () => {
    mockTx();
    const result = await updateOwnProfile({
      ...payload,
      englishCertificate: {
        ...english,
        file: { objectKey: 'language-certificates/staff-other/x.pdf', fileName: 'x.pdf' },
      },
    } as unknown as OwnProfileSchema);
    expect('error' in result).toBe(true);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(verifyUploadedObject).not.toHaveBeenCalled();
  });

  it('stores a verified scan on the row', async () => {
    const key = 'language-certificates/staff-own/new.pdf';
    (verifyUploadedObject as unknown as Mock).mockResolvedValue({
      ok: true,
      file: {
        objectKey: key,
        fileName: 'scan.pdf',
        contentType: 'application/pdf',
        sizeBytes: 900,
        pageCount: 1,
        sha256: 'abc',
      },
    });
    const tx = mockTx();
    await updateOwnProfile({
      ...payload,
      englishCertificate: { ...english, file: { objectKey: key, fileName: 'scan.pdf' } },
    } as unknown as OwnProfileSchema);

    expect(tx.languageCertificate.upsert.mock.calls[0][0].create).toMatchObject({
      fileKey: key,
      fileName: 'scan.pdf',
      fileSizeBytes: 900,
    });
    expect(tx.auditLog.create.mock.calls[0][0].data.changes.englishCertificate.to).toContain(
      'файл: scan.pdf'
    );
  });

  it('deletes the old scan only AFTER a replacement commits', async () => {
    const old = 'language-certificates/staff-own/old.pdf';
    const next = 'language-certificates/staff-own/new.pdf';
    (verifyUploadedObject as unknown as Mock).mockResolvedValue({
      ok: true,
      file: {
        objectKey: next,
        fileName: 'new.pdf',
        contentType: 'application/pdf',
        sizeBytes: 900,
        pageCount: 1,
        sha256: 'def',
      },
    });
    const tx = mockTx();
    tx.languageCertificate.findMany.mockResolvedValue([
      {
        id: 'c1',
        kind: 'ENGLISH',
        series: 'EN',
        number: '123',
        issuedOn: new Date('2024-03-15T00:00:00.000Z'),
        issuedBy: 'British Council',
        level: null,
        decisionNumber: null,
        decisionDate: null,
        fileKey: old,
        fileName: 'old.pdf',
      },
    ]);
    await updateOwnProfile({
      ...payload,
      englishCertificate: { ...english, file: { objectKey: next, fileName: 'new.pdf' } },
    } as unknown as OwnProfileSchema);

    expect(safeDeleteObject).toHaveBeenCalledTimes(1);
    expect(safeDeleteObject).toHaveBeenCalledWith(
      'profile.updateOwnProfile',
      old,
      expect.anything()
    );
  });

  it('keeps the staged scan when the save fails, so the retry finds it', async () => {
    const key = 'language-certificates/staff-own/new.pdf';
    (verifyUploadedObject as unknown as Mock).mockResolvedValue({
      ok: true,
      file: {
        objectKey: key,
        fileName: 'scan.pdf',
        contentType: 'application/pdf',
        sizeBytes: 900,
        pageCount: 1,
        sha256: 'abc',
      },
    });
    const tx = mockTx();
    tx.staff.update.mockRejectedValue(new Error('db down'));

    const result = await updateOwnProfile({
      ...payload,
      englishCertificate: { ...english, file: { objectKey: key, fileName: 'scan.pdf' } },
    } as unknown as OwnProfileSchema);
    expect('error' in result).toBe(true);
    expect(safeDeleteObject).not.toHaveBeenCalled();
  });
});

// Citation counts (owner, 2026-10-06): an НПП now types their own. They feed
// the citation indicators, so the save re-scores.
describe('updateOwnProfile — citations', () => {
  it('saves the three citation counts and re-scores', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 'staff-own' } });
    const tx = mockTx();
    await updateOwnProfile({
      ...payload,
      wosCitationCount: '12',
      scopusCitationCount: '7',
      googleScholarCitationCount: '140',
    } as unknown as OwnProfileSchema);

    expect(tx.staff.update.mock.calls[0][0].data).toMatchObject({
      wosCitationCount: 12,
      scopusCitationCount: 7,
      googleScholarCitationCount: 140,
    });
    expect(syncProfileDerived).toHaveBeenCalledWith(tx, 'staff-own');
  });
});
