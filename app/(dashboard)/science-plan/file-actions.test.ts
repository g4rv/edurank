import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    staff: { findUnique: vi.fn() },
    scienceWork: { findUnique: vi.fn(), update: vi.fn() },
    scienceWorkType: { findUnique: vi.fn() },
    scienceRecordFile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));
vi.mock('@/lib/science/r2', () => ({
  objectKeyFor: vi.fn(),
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  getObjectBytes: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('@/lib/log', () => ({ logError: vi.fn(), logWarning: vi.fn() }));

import { Prisma } from '@/lib/generated/prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { logWarning } from '@/lib/log';
import * as r2 from '@/lib/science/r2';
import {
  attachFile,
  deleteFile,
  discardUpload,
  fileUrl,
  presignUpload,
  replaceFile,
} from './file-actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveScienceTemplate as unknown as Mock;
const mockLogWarning = logWarning as unknown as Mock;
const mockObjectKeyFor = r2.objectKeyFor as unknown as Mock;
const mockPresignPut = r2.presignPut as unknown as Mock;
const mockPresignGet = r2.presignGet as unknown as Mock;
const mockHeadObject = r2.headObject as unknown as Mock;
const mockGetObjectBytes = r2.getObjectBytes as unknown as Mock;
const mockDeleteObject = r2.deleteObject as unknown as Mock;

/**
 * A REAL PrismaClientKnownRequestError — `isUniqueViolation` tests with
 * `instanceof`, so a plain object carrying code P2002 would fall through to
 * the generic message (the trap `record-actions.test.ts` already documents).
 */
const unique = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

const TEMPLATE = { id: 't1', academicYear: '2026/2027', status: 'OPEN', stakeYear: 2026 };

const STAFF = {
  lastName: 'Петренко',
  firstName: 'Петро',
  patronymic: 'Петрович',
  isNpp: true,
  departmentId: 'd1',
  partTimeDepartments: [] as { departmentId: string }[],
};

/** Owned by the caller (`staff-1`): they created it. */
const WORK = {
  id: 'w1',
  templateId: 't1',
  createdById: 'staff-1',
  records: [{ staffId: 'staff-1' }],
  workTypeId: 'wtype-1',
  workType: { fileRule: 'OPTIONAL', sharedFile: false },
};

/** `%PDF-1.7` — enough for `sniffType` to read it as a PDF, not a real
 *  structured document (no page tree), which is fine everywhere it is used:
 *  those tests never reach `pdfPageCount`. */
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
let REAL_PDF_BYTES: Uint8Array;

const base = {
  workId: 'w1',
  fileName: 'сертифікат.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  sha256: 'b'.repeat(64),
  objectKey: 'evidence/t1/existing.pdf',
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u1', staffId: 'staff-1', role: 'USER' } });
  mockTemplate.mockResolvedValue(TEMPLATE);
  (db.staff.findUnique as Mock).mockResolvedValue(STAFF);
  (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
  (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(null);
  // After a work lets go of a file: by default it has NO work left (an orphan).
  (db.scienceRecordFile.findMany as Mock).mockResolvedValue([]);
  (db.scienceRecordFile.create as Mock).mockResolvedValue({ id: 'f1' });
  (db.scienceRecordFile.delete as Mock).mockResolvedValue({ id: 'f1' });
  (db.$transaction as Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(db));

  mockObjectKeyFor.mockReturnValue('evidence/t1/generated.pdf');
  mockPresignPut.mockResolvedValue('https://r2.example/put');
  mockPresignGet.mockResolvedValue('https://r2.example/get');
  mockHeadObject.mockResolvedValue({ sizeBytes: 1024, contentType: 'application/pdf' });
  mockGetObjectBytes.mockResolvedValue(PDF_BYTES);
  mockDeleteObject.mockResolvedValue(undefined);

  if (!REAL_PDF_BYTES) {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.addPage();
    REAL_PDF_BYTES = await doc.save();
  }
});

/** A file somebody stored for a вид роботи that does NOT share files — a сертифікат. */
const STORED_CERTIFICATE = {
  id: 'f-existing',
  fileName: 'сертифікат.pdf',
  sizeBytes: 1024,
  pageCount: 1,
  works: [
    {
      id: 'w9',
      createdById: 'someone-else',
      workTypeId: 'wtype-article',
      workType: { sharedFile: false },
    },
  ],
};

/** A conference programme: stored once, held by one colleague's work. */
const STORED_PROGRAMME = {
  id: 'f-programme',
  fileName: 'програма.pdf',
  sizeBytes: 2048,
  pageCount: 12,
  works: [
    {
      id: 'w8',
      createdById: 'colleague',
      workTypeId: 'wtype-paper',
      workType: { sharedFile: true },
    },
  ],
};

describe('presignUpload', () => {
  it('refuses a hash that already exists ANYWHERE (D28) — before spending the upload', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_CERTIFICATE);
    const result = await presignUpload({ ...base, sha256: 'a'.repeat(64) });
    expect(result).toEqual({ error: 'Цей файл уже використано в іншому записі' });
    expect(mockPresignPut).not.toHaveBeenCalled();
  });

  it('names nothing about the other record — it may be on another кафедра', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...STORED_CERTIFICATE,
      uploadedBy: { lastName: 'Іваненко' },
    });
    const result = await presignUpload({ ...base, sha256: 'a'.repeat(64) });
    expect(JSON.stringify(result)).not.toContain('Іваненко');
  });

  it('refuses a type outside the list and a file over the cap', async () => {
    expect(await presignUpload({ ...base, contentType: 'application/zip' })).toMatchObject({
      error: expect.any(String),
    });
    expect(await presignUpload({ ...base, sizeBytes: 11 * 1024 * 1024 })).toMatchObject({
      error: expect.any(String),
    });
  });

  it('asks for NO work — the upload happens before the record exists (D27)', async () => {
    // This is the whole point of the rework. While the key carried a workId,
    // a file could only be uploaded after the record was saved, so a record
    // proved by a file ALONE could never be created and a failed upload was
    // unrecoverable.
    expect(await presignUpload(base)).toEqual({
      ok: true,
      url: 'https://r2.example/put',
      objectKey: 'evidence/t1/generated.pdf',
    });
    expect(db.scienceWork.findUnique).not.toHaveBeenCalled();
  });

  it('generates a server-side key from the type, never the uploaded name', async () => {
    await presignUpload(base);
    expect(mockObjectKeyFor).toHaveBeenCalledWith({ templateId: 't1', ext: 'pdf' });
  });

  it('refuses a closed year', async () => {
    mockTemplate.mockResolvedValue({ ...TEMPLATE, status: 'CLOSED' });
    expect(await presignUpload(base)).toEqual({ error: 'Планування на цей рік закрито' });
  });

  it('refuses anybody who is not an НПП', async () => {
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: false });
    expect(await presignUpload(base)).toMatchObject({ error: expect.any(String) });
    expect(mockPresignPut).not.toHaveBeenCalled();
  });

  it('turns an unconfigured bucket into a sentence, never an exception', async () => {
    // A missing R2_* env var throws out of `presignPut`. On production that
    // is the difference between «щось пішло не так» and a 500.
    mockPresignPut.mockRejectedValue(new Error('Відсутня змінна середовища R2_BUCKET'));
    await expect(presignUpload(base)).resolves.toEqual({
      error: 'Не вдалося підготувати завантаження файлу',
    });
  });
});

describe('discardUpload', () => {
  it('drops an object nothing references', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(null);
    await discardUpload('evidence/t1/abandoned.pdf');
    expect(mockDeleteObject).toHaveBeenCalledWith('evidence/t1/abandoned.pdf');
  });

  it('REFUSES to touch an object a row points at', async () => {
    // Otherwise anybody who learned a key could delete the evidence behind
    // somebody else's record.
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({ id: 'f1' });
    await discardUpload('evidence/t1/in-use.pdf');
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });
});

describe('attachFile', () => {
  it('refuses a file on a link-only type (D47) and drops the object', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      workType: { fileRule: 'NONE' },
    });
    expect(await attachFile(base)).toEqual({
      error: 'Для цього виду роботи додається лише посилання, без файлу',
    });
    expect(mockDeleteObject).toHaveBeenCalled();
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
  });

  it('trusts the STORED bytes, not the browser', async () => {
    // The browser said PDF; the object is something else.
    mockGetObjectBytes.mockResolvedValue(new Uint8Array([0x4d, 0x5a]));
    const result = await attachFile(base);
    expect(result).toMatchObject({ error: expect.stringContaining('файл') });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
    expect(mockDeleteObject).toHaveBeenCalled(); // the bad object does not linger
  });

  it('re-hashes server-side and refuses a duplicate the browser lied about', async () => {
    mockGetObjectBytes.mockResolvedValue(PDF_BYTES);
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({ id: 'f-existing' });
    expect(await attachFile(base)).toMatchObject({ error: expect.any(String) });
    expect(mockDeleteObject).toHaveBeenCalled();
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
  });

  it('counts the pages of a PDF and stores them', async () => {
    mockGetObjectBytes.mockResolvedValue(REAL_PDF_BYTES);
    (db.scienceRecordFile.create as Mock).mockResolvedValue({ id: 'f1' });
    expect(await attachFile(base)).toMatchObject({ ok: true, fileId: 'f1' });
    expect((db.scienceRecordFile.create as Mock).mock.calls[0][0].data).toMatchObject({
      pageCount: 3,
      works: { connect: { id: 'w1' } },
    });
  });

  it('refuses an object that disagrees with the declared size (deletes it too)', async () => {
    mockHeadObject.mockResolvedValue({
      sizeBytes: 11 * 1024 * 1024,
      contentType: 'application/pdf',
    });
    const result = await attachFile(base);
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockDeleteObject).toHaveBeenCalledWith(base.objectKey);
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
  });

  it('refuses an object that no longer exists', async () => {
    mockHeadObject.mockResolvedValue(null);
    expect(await attachFile(base)).toMatchObject({ error: expect.any(String) });
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('maps a P2002 on sha256 to the same «вже використано» message', async () => {
    mockGetObjectBytes.mockResolvedValue(REAL_PDF_BYTES);
    (db.$transaction as Mock).mockRejectedValueOnce(unique(['sha256']));
    expect(await attachFile(base)).toEqual({ error: 'Цей файл уже використано в іншому записі' });
    expect(mockDeleteObject).toHaveBeenCalledWith(base.objectKey);
  });

  it('refuses a work the caller has no claim on', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      createdById: 'other',
      records: [],
    });
    expect(await attachFile(base)).toEqual({ error: 'Роботу не знайдено' });
    expect(mockHeadObject).not.toHaveBeenCalled();
  });

  it('writes an audit entry on success', async () => {
    mockGetObjectBytes.mockResolvedValue(REAL_PDF_BYTES);
    await attachFile(base);
    expect(db.auditLog.create).toHaveBeenCalled();
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.entity).toBe('ScienceRecordFile');
    expect(entry.action).toBe('CREATE');
  });

  it('asks the database for only APPROVED records on the work too', async () => {
    await attachFile(base);
    const args = (db.scienceWork.findUnique as Mock).mock.calls[0][0];
    expect(args.select.records.where).toEqual({ status: 'APPROVED' });
  });

  it('returns an error rather than throwing when headObject hits an R2 hiccup', async () => {
    mockHeadObject.mockRejectedValue(new Error('R2 unreachable'));
    await expect(attachFile(base)).resolves.toMatchObject({ error: expect.any(String) });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
    // Unknown whether the object even exists yet — no cleanup attempted.
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('returns an error rather than throwing when getObjectBytes hits an R2 hiccup, and still cleans up', async () => {
    mockGetObjectBytes.mockRejectedValue(new Error('R2 unreachable'));
    await expect(attachFile(base)).resolves.toMatchObject({ error: expect.any(String) });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
    expect(mockDeleteObject).toHaveBeenCalledWith(base.objectKey);
  });

  it('does not treat an objectKey collision the same as a plain write failure', async () => {
    mockGetObjectBytes.mockResolvedValue(REAL_PDF_BYTES);
    (db.$transaction as Mock).mockRejectedValueOnce(unique(['objectKey']));
    expect(await attachFile(base)).toEqual({ error: 'Цей файл уже використано в іншому записі' });
  });

  it('falls back to the generic write-failure message for an unrelated P2002', async () => {
    mockGetObjectBytes.mockResolvedValue(REAL_PDF_BYTES);
    (db.$transaction as Mock).mockRejectedValueOnce(unique(['someOtherColumn']));
    const result = await attachFile(base);
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(result).not.toEqual({ error: 'Цей файл уже використано в іншому записі' });
  });
});

describe('fileUrl — the three-way entitlement', () => {
  const FILE = {
    objectKey: 'evidence/t1/w1/f.pdf',
    works: [{ createdById: 'staff-1', records: [{ staffId: 'staff-1' }] }],
  };

  beforeEach(() => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(FILE);
  });

  it('signs a GET for somebody with their own record on the work', async () => {
    expect(await fileUrl('f1')).toEqual({ ok: true, url: 'https://r2.example/get' });
    expect(mockPresignGet).toHaveBeenCalledWith('evidence/t1/w1/f.pdf');
  });

  it('signs a GET for ADMIN even with no record at all', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [{ createdById: 'someone-else', records: [] }],
    });
    expect(await fileUrl('f1')).toEqual({ ok: true, url: 'https://r2.example/get' });
  });

  it('signs a GET for a «Перевірка науки» editor even with no record at all', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'EDITOR' } });
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [{ createdById: 'someone-else', records: [] }],
    });
    (db.staff.findUnique as Mock).mockResolvedValue({ division: { canOverseeScience: true } });
    expect(await fileUrl('f1')).toEqual({ ok: true, url: 'https://r2.example/get' });
  });

  it('refuses an editor without «Перевірка науки»', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'EDITOR' } });
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [{ createdById: 'someone-else', records: [] }],
    });
    (db.staff.findUnique as Mock).mockResolvedValue({ division: { canOverseeScience: false } });
    expect(await fileUrl('f1')).toEqual({ error: 'У вас немає доступу до цього файлу' });
    expect(mockPresignGet).not.toHaveBeenCalled();
  });

  it('refuses a co-author of a DIFFERENT work', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [{ createdById: 'someone-else', records: [{ staffId: 'someone-else' }] }],
    });
    expect(await fileUrl('f1')).toEqual({ error: 'У вас немає доступу до цього файлу' });
  });

  it('signs a GET for a colleague who holds ONE of a shared file’s works', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [
        { createdById: 'someone-else', records: [{ staffId: 'someone-else' }] },
        { createdById: 'staff-1', records: [{ staffId: 'staff-1' }] },
      ],
    });
    expect(await fileUrl('f1')).toEqual({ ok: true, url: 'https://r2.example/get' });
  });

  it('refuses an anonymous caller', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await fileUrl('f1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses an unknown file', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(null);
    expect(await fileUrl('missing')).toEqual({ error: 'Файл не знайдено' });
  });

  it('is not gated by isNpp or an OPEN template — ADMIN reads year-round', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    mockTemplate.mockResolvedValue({ ...TEMPLATE, status: 'CLOSED' });
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: false });
    expect(await fileUrl('f1')).toEqual({ ok: true, url: 'https://r2.example/get' });
  });

  it('asks the database for only APPROVED records — a REMOVED draw must not keep read access', async () => {
    await fileUrl('f1');
    const args = (db.scienceRecordFile.findUnique as Mock).mock.calls[0][0];
    expect(args.select.works.select.records.where).toEqual({ status: 'APPROVED' });
  });
});

describe('deleteFile', () => {
  /** A work proved by a LINK as well, so removing this file leaves evidence
   *  standing. `_count.files` is what the D27 check measures. */
  const FILE = {
    id: 'f1',
    objectKey: 'evidence/t1/w1/f.pdf',
    fileName: 'сертифікат.pdf',
    // The work's creator uploaded it, unless a test says otherwise.
    uploadedById: 'staff-1',
    works: [
      {
        id: 'w1',
        templateId: 't1',
        createdById: 'staff-1',
        records: [{ staffId: 'staff-1' }],
        link: 'https://example.com/a',
        workType: { linkRule: 'OPTIONAL', fileRule: 'OPTIONAL' },
        _count: { files: 1 },
      },
    ],
  };

  /** Proved by this file and nothing else — the state that only became
   *  possible once a file-only record could be created at all. */
  const ONLY_EVIDENCE = {
    ...FILE,
    works: [{ ...FILE.works[0], link: null, _count: { files: 1 } }],
  };

  beforeEach(() => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(FILE);
  });

  it('REFUSES to remove the only evidence a record has (D27)', async () => {
    // Deleting it would leave a record proving nothing — the exact state
    // `saveRecord` and `updateWorkEvidence` both refuse to create.
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(ONLY_EVIDENCE);
    expect(await deleteFile('f1')).toEqual({
      error:
        'Додайте посилання або файл підтвердження: це єдине підтвердження цього запису — скористайтеся «Замінити»',
    });
    expect(db.scienceRecordFile.delete).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('allows it when a SECOND file remains — replacing a bad scan', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...ONLY_EVIDENCE,
      works: [{ ...ONLY_EVIDENCE.works[0], _count: { files: 2 } }],
    });
    expect(await deleteFile('f1')).toEqual({ ok: true });
  });

  it('refuses even for ADMIN — the rule is about the RECORD, not the caller', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(ONLY_EVIDENCE);
    expect(await deleteFile('f1')).toMatchObject({ error: expect.any(String) });
    expect(db.scienceRecordFile.delete).not.toHaveBeenCalled();
  });

  it('removes the row and the object for the work’s creator — when no other work holds the file', async () => {
    // After the work lets go, the file has NO work left: it is an orphan.
    (db.scienceRecordFile.findMany as Mock).mockResolvedValue([
      { id: 'f1', objectKey: 'evidence/t1/w1/f.pdf' },
    ]);
    expect(await deleteFile('f1')).toEqual({ ok: true });
    expect(db.scienceWork.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { files: { disconnect: { id: 'f1' } } },
    });
    expect(db.scienceRecordFile.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f1'] } } });
    expect(mockDeleteObject).toHaveBeenCalledWith('evidence/t1/w1/f.pdf');
  });

  // One stored file, many works (owner, 2026-11-13).
  it('KEEPS a shared file and its object while another work still holds it', async () => {
    // Another colleague's work still holds the programme: nothing is an orphan.
    (db.scienceRecordFile.findMany as Mock).mockResolvedValue([]);
    expect(await deleteFile('f1', 'w1')).toEqual({ ok: true });
    expect(db.scienceWork.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { files: { disconnect: { id: 'f1' } } },
    });
    expect(db.scienceRecordFile.deleteMany).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('needs the work to be NAMED when the file belongs to several — a guess would hit the wrong one', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [FILE.works[0], { ...FILE.works[0], id: 'w2', createdById: 'colleague' }],
    });
    expect(await deleteFile('f1')).toEqual({ error: 'Файл не знайдено' });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('refuses a work the file is not connected to', async () => {
    expect(await deleteFile('f1', 'w-not-mine')).toEqual({ error: 'Файл не знайдено' });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('lets ADMIN delete anybody’s file', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: true });
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [{ ...FILE.works[0], createdById: 'someone-else', records: [] }],
    });
    expect(await deleteFile('f1')).toEqual({ ok: true });
  });

  it('refuses a co-author who joined the work but did not create it — narrower than fileUrl', async () => {
    // The concrete risk this closes: a co-author who drew only a small share
    // of a SHARED work must not be able to unilaterally delete the one
    // evidence file every other co-author's — possibly much larger — claim
    // depends on. `records: [{ staffId: 'staff-1' }]` proves the caller DOES
    // have a record on the work — `ownsWork` would admit them — and they are
    // still refused, because `deleteFile` deliberately does not use it.
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      uploadedById: 'someone-else',
      works: [{ ...FILE.works[0], createdById: 'someone-else', records: [{ staffId: 'staff-1' }] }],
    });
    expect(await deleteFile('f1')).toEqual({
      error: 'Змінити файл може той, хто його додав, або автор роботи',
    });
    expect(db.scienceRecordFile.delete).not.toHaveBeenCalled();
  });

  it('lets a co-author delete a file THEY uploaded (D46)', async () => {
    // Their own scan — taking it back is theirs to do. The work is somebody
    // else's and a link still proves it.
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      uploadedById: 'staff-1',
      works: [{ ...FILE.works[0], createdById: 'someone-else', records: [{ staffId: 'staff-1' }] }],
    });
    expect(await deleteFile('f1')).toEqual({ ok: true });
  });

  it('refuses a file from a closed year', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...FILE,
      works: [{ ...FILE.works[0], templateId: 'old-template' }],
    });
    expect(await deleteFile('f1')).toEqual({ error: 'Файл не знайдено' });
  });

  it('never blocks on a failed object delete — logs a warning instead', async () => {
    (db.scienceRecordFile.findMany as Mock).mockResolvedValue([
      { id: 'f1', objectKey: 'evidence/t1/w1/f.pdf' },
    ]);
    mockDeleteObject.mockRejectedValue(new Error('R2 unreachable'));
    expect(await deleteFile('f1')).toEqual({ ok: true });
    expect(mockLogWarning).toHaveBeenCalled();
  });

  it('writes an audit entry', async () => {
    await deleteFile('f1');
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.action).toBe('DELETE');
    expect(entry.entity).toBe('ScienceRecordFile');
  });
});

describe('replaceFile — the new file in before the old one goes (D46)', () => {
  const OLD = {
    id: 'f1',
    objectKey: 'evidence/t1/old.pdf',
    fileName: 'old.pdf',
    uploadedById: 'staff-1',
    works: [
      {
        id: 'w1',
        templateId: 't1',
        createdById: 'staff-1',
        workType: { fileRule: 'OPTIONAL' },
      },
    ],
  };
  const NEW = { fileId: 'f1', objectKey: 'evidence/t1/new.pdf', fileName: 'new.pdf' };

  beforeEach(() => {
    // One mock answers two questions: the OLD file by id, and — inside the
    // verification — «is this hash already stored anywhere?» (no).
    (db.scienceRecordFile.findUnique as Mock).mockImplementation(({ where }) =>
      Promise.resolve(where.id ? OLD : null)
    );
    (db.scienceRecordFile.create as Mock).mockResolvedValue({ id: 'f2' });
  });

  it('swaps the rows in one transaction, then drops the OLD object only', async () => {
    // Letting go of the old file leaves it with no work: it is deleted.
    (db.scienceRecordFile.findMany as Mock).mockResolvedValue([
      { id: 'f1', objectKey: OLD.objectKey },
    ]);
    expect(await replaceFile(NEW)).toEqual({ ok: true, fileId: 'f2' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.scienceRecordFile.create).toHaveBeenCalled();
    expect(db.scienceWork.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { files: { disconnect: { id: 'f1' } } },
    });
    expect(db.scienceRecordFile.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f1'] } } });
    expect(mockDeleteObject).toHaveBeenCalledWith(OLD.objectKey);
    expect(mockDeleteObject).not.toHaveBeenCalledWith(NEW.objectKey);
  });

  it('keeps the OLD object when a colleague’s work still holds that shared file', async () => {
    (db.scienceRecordFile.findMany as Mock).mockResolvedValue([]);
    expect(await replaceFile(NEW)).toEqual({ ok: true, fileId: 'f2' });
    expect(db.scienceRecordFile.deleteMany).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalledWith(OLD.objectKey);
  });

  it('writes the new row onto the same work, as the caller\u2019s upload', async () => {
    await replaceFile(NEW);
    expect((db.scienceRecordFile.create as Mock).mock.calls[0][0].data).toMatchObject({
      works: { connect: { id: 'w1' } },
      uploadedById: 'staff-1',
      objectKey: NEW.objectKey,
    });
  });

  it('keeps the old file when the new one fails verification', async () => {
    mockGetObjectBytes.mockResolvedValue(new Uint8Array([0x4d, 0x5a])); // not a PDF
    expect(await replaceFile(NEW)).toMatchObject({ error: expect.any(String) });
    expect(db.scienceRecordFile.delete).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalledWith(OLD.objectKey);
  });

  it('keeps the old file and drops the NEW object when the save fails', async () => {
    (db.scienceRecordFile.create as Mock).mockRejectedValue(new Error('boom'));
    expect(await replaceFile(NEW)).toEqual({
      error: 'Не вдалося замінити файл. Старий файл залишився без змін',
    });
    expect(mockDeleteObject).toHaveBeenCalledWith(NEW.objectKey);
    expect(mockDeleteObject).not.toHaveBeenCalledWith(OLD.objectKey);
  });

  it('lets a co-author replace a file they uploaded', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockImplementation(({ where }) =>
      Promise.resolve(
        where.id ? { ...OLD, works: [{ ...OLD.works[0], createdById: 'someone-else' }] } : null
      )
    );
    expect(await replaceFile(NEW)).toEqual({ ok: true, fileId: 'f2' });
  });

  it('refuses somebody who may not change this file, and drops the new object', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockImplementation(({ where }) =>
      Promise.resolve(
        where.id
          ? {
              ...OLD,
              uploadedById: 'staff-2',
              works: [{ ...OLD.works[0], createdById: 'staff-2' }],
            }
          : null
      )
    );
    expect(await replaceFile(NEW)).toEqual({
      error: 'Змінити файл може той, хто його додав, або автор роботи',
    });
    expect(mockDeleteObject).toHaveBeenCalledWith(NEW.objectKey);
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
  });

  it('refuses a file on a type that takes no file (D47), and drops the new object', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockImplementation(({ where }) =>
      Promise.resolve(
        where.id ? { ...OLD, works: [{ ...OLD.works[0], workType: { fileRule: 'NONE' } }] } : null
      )
    );
    expect(await replaceFile(NEW)).toEqual({
      error: 'Для цього виду роботи додається лише посилання, без файлу',
    });
    expect(mockDeleteObject).toHaveBeenCalledWith(NEW.objectKey);
  });

  it('refuses a file of another year', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockImplementation(({ where }) =>
      Promise.resolve(
        where.id ? { ...OLD, works: [{ ...OLD.works[0], templateId: 'old-year' }] } : null
      )
    );
    expect(await replaceFile(NEW)).toEqual({ error: 'Файл не знайдено' });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
  });

  it('writes one UPDATE audit entry naming the old and the new file', async () => {
    await replaceFile(NEW);
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.action).toBe('UPDATE');
    expect(entry.entity).toBe('ScienceRecordFile');
    expect(entry.changes).toHaveProperty('fileName');
  });
});

// ─── One stored file, many works (owner, 2026-11-13) ─────────────────────────
//
// Organisers issue no certificates; the conference programme names every
// presenter, so colleagues attach the SAME file. It is stored ONCE: the second
// colleague is told «use it» before any bytes move, and the save connects.

describe('presignUpload — a conference programme that is already stored', () => {
  const { workId: _w, ...noWork } = base;
  const asType = (sharedFile: boolean) =>
    (db.scienceWorkType.findUnique as Mock).mockResolvedValue({ id: 'wtype-paper', sharedFile });

  it('answers «use it» — NO upload — for a colleague, when the вид shares files', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_PROGRAMME);
    asType(true);
    const result = await presignUpload({ ...noWork, workTypeId: 'wtype-paper' });
    expect(result).toEqual({
      ok: true,
      reuse: { fileId: 'f-programme', fileName: 'програма.pdf', sizeBytes: 2048, pageCount: 12 },
    });
    expect(mockPresignPut).not.toHaveBeenCalled(); // not a single byte is uploaded
  });

  it('refuses the SAME person the same programme on a second work of that вид', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...STORED_PROGRAMME,
      works: [
        {
          id: 'w8',
          createdById: 'staff-1',
          workTypeId: 'wtype-paper',
          workType: { sharedFile: true },
        },
      ],
    });
    asType(true);
    expect(await presignUpload({ ...noWork, workTypeId: 'wtype-paper' })).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
  });

  it('refuses a вид роботи that does not share files, even for a programme', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_PROGRAMME);
    asType(false);
    expect(await presignUpload({ ...noWork, workTypeId: 'wtype-paper' })).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
  });

  it('never hands out a personal сертифікат — a shared вид cannot borrow it', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_CERTIFICATE);
    asType(true);
    expect(await presignUpload({ ...noWork, workTypeId: 'wtype-paper' })).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
  });

  it('says nothing is shareable when the browser names no вид (an old client)', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_PROGRAMME);
    expect(await presignUpload(noWork)).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
  });
});

describe('attachFile / replaceFile — connecting to a file that is already stored', () => {
  const SHARED_WORK = {
    ...WORK,
    workTypeId: 'wtype-paper',
    workType: { fileRule: 'OPTIONAL', sharedFile: true },
  };
  const EXISTING = { workId: 'w1', existingFileId: 'f-programme', fileName: 'програма.pdf' };

  it('CONNECTS the work to the stored file — no new row, nothing uploaded, nothing deleted', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(SHARED_WORK);
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_PROGRAMME);
    expect(await attachFile(EXISTING)).toEqual({ ok: true, fileId: 'f-programme' });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
    expect(db.scienceWork.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { files: { connect: { id: 'f-programme' } } },
    });
    expect(mockHeadObject).not.toHaveBeenCalled(); // no bytes to check
    expect(mockDeleteObject).not.toHaveBeenCalled(); // and somebody else's file is never dropped
  });

  it('refuses it for a вид that does not share files — a hand-made request cannot borrow', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_PROGRAMME);
    expect(await attachFile(EXISTING)).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('refuses a personal сертифікат even on a вид that shares files', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(SHARED_WORK);
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue(STORED_CERTIFICATE);
    expect(await attachFile({ ...EXISTING, existingFileId: 'f-existing' })).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('refuses the work’s own author a second connection to the same file', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(SHARED_WORK);
    (db.scienceRecordFile.findUnique as Mock).mockResolvedValue({
      ...STORED_PROGRAMME,
      works: [
        {
          id: 'w8',
          createdById: 'staff-1',
          workTypeId: 'wtype-paper',
          workType: { sharedFile: true },
        },
      ],
    });
    expect(await attachFile(EXISTING)).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
  });

  it('replaces by connecting to a stored file, and lets the old one go', async () => {
    (db.scienceRecordFile.findUnique as Mock).mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'f1'
          ? {
              id: 'f1',
              objectKey: 'evidence/t1/old.pdf',
              fileName: 'old.pdf',
              uploadedById: 'staff-1',
              works: [
                {
                  id: 'w1',
                  templateId: 't1',
                  createdById: 'staff-1',
                  workTypeId: 'wtype-paper',
                  workType: { fileRule: 'OPTIONAL', sharedFile: true },
                },
              ],
            }
          : where.id === 'f-programme'
            ? STORED_PROGRAMME
            : null
      )
    );
    (db.scienceRecordFile.findMany as Mock).mockResolvedValue([
      { id: 'f1', objectKey: 'evidence/t1/old.pdf' },
    ]);
    expect(
      await replaceFile({
        fileId: 'f1',
        workId: 'w1',
        existingFileId: 'f-programme',
        fileName: 'програма.pdf',
      })
    ).toEqual({ ok: true, fileId: 'f-programme' });
    expect(db.scienceRecordFile.create).not.toHaveBeenCalled();
    expect(db.scienceWork.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { files: { connect: { id: 'f-programme' } } },
    });
    expect(mockDeleteObject).toHaveBeenCalledWith('evidence/t1/old.pdf');
  });
});
