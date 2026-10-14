import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    qualification: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    db: {
      staff: { findUnique: vi.fn() },
      qualification: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});
vi.mock('@/lib/science/r2', async () => {
  const actual = await vi.importActual<typeof import('@/lib/science/r2')>('@/lib/science/r2');
  return { ...actual, deleteObject: vi.fn() };
});
vi.mock('@/lib/science/file-intake', () => ({
  verifyUploadedObject: vi.fn(),
  safeDeleteObject: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
import { createQualification, deleteQualification, updateQualification } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;
const mockFind = db.qualification.findUnique as unknown as Mock;
const mockVerify = verifyUploadedObject as unknown as Mock;
const mockDrop = safeDeleteObject as unknown as Mock;
const tx = (db as unknown as { __tx: Record<string, Record<string, Mock>> }).__tx;

const VALUES = {
  kind: 'TRAINING' as const,
  institution: 'Київський університет',
  documentType: 'CERTIFICATE' as const,
  series: 'ПК',
  number: '12345',
  topic: 'Цифрові технології в освіті',
  issuedOn: '2025-05-20',
  credits: '1,5',
};

const OWNER = {
  id: 'npp-1',
  isNpp: true,
  lastName: 'Петренко',
  firstName: 'Петро',
  patronymic: 'Петрович',
};

const STORED = {
  id: 'q1',
  staffId: 'npp-1',
  kind: 'TRAINING',
  institution: 'Старий заклад',
  documentType: 'CERTIFICATE',
  series: null,
  number: '1',
  topic: 'Стара тема',
  issuedOn: new Date('2024-01-10T00:00:00.000Z'),
  creditsHundredths: 300,
  fileKey: 'qualifications/npp-1/old.pdf',
  fileName: 'old.pdf',
};

function signIn(
  role: 'ADMIN' | 'EDITOR' | 'USER',
  staffId: string | null,
  divisionAllows = false,
  owner: Partial<typeof OWNER> | null = {}
) {
  mockAuth.mockResolvedValue({ user: { id: staffId ?? 'acct', role, staffId } });
  mockStaff.mockImplementation(async (args: { where: { id: string } }) => {
    // The owner lookup selects `isNpp`; the division lookup selects `division`.
    if ('division' in ((args as { select?: object }).select ?? {})) {
      return { division: { canViewQualifications: divisionAllows } };
    }
    return owner === null ? null : { ...OWNER, ...owner, id: args.where.id };
  });
}

const verifiedFile = (key: string) => ({
  ok: true as const,
  file: {
    objectKey: key,
    fileName: 'scan.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1000,
    pageCount: 1,
    sha256: 'abc',
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  tx.qualification.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-1',
      ...data,
    })
  );
  tx.qualification.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...STORED,
      ...data,
    })
  );
});

describe('createQualification — who may write', () => {
  it('lets the НПП add to their own record', async () => {
    signIn('USER', 'npp-1');
    const result = await createQualification({ staffId: 'npp-1', values: VALUES });
    expect(result).toEqual({ ok: true, id: 'new-1' });
    expect(tx.qualification.create).toHaveBeenCalledTimes(1);
  });

  it('lets ADMIN add to anybody’s', async () => {
    signIn('ADMIN', 'admin-1');
    const result = await createQualification({ staffId: 'npp-1', values: VALUES });
    expect(result).toEqual({ ok: true, id: 'new-1' });
  });

  it('refuses another НПП', async () => {
    signIn('USER', 'npp-2');
    const result = await createQualification({ staffId: 'npp-1', values: VALUES });
    expect(result).toEqual({ error: 'Недостатньо прав' });
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('refuses an EDITOR whose division can only read', async () => {
    signIn('EDITOR', 'ed-1', true);
    const result = await createQualification({ staffId: 'npp-1', values: VALUES });
    expect(result).toEqual({ error: 'Недостатньо прав' });
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('refuses a session with nobody in it', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await createQualification({ staffId: 'npp-1', values: VALUES });
    expect(result).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses an administrative record, ADMIN included', async () => {
    signIn('ADMIN', 'admin-1', false, { isNpp: false });
    const result = await createQualification({ staffId: 'adm-1', values: VALUES });
    expect(result).toEqual({ error: 'Недостатньо прав' });
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('says so when the person does not exist', async () => {
    signIn('ADMIN', 'admin-1', false, null);
    const result = await createQualification({ staffId: 'ghost', values: VALUES });
    expect(result).toEqual({ error: 'Працівника не знайдено' });
  });

  it('leaves a refused caller’s staged object alone', async () => {
    signIn('USER', 'npp-2');
    await createQualification({
      staffId: 'npp-1',
      values: VALUES,
      file: { objectKey: 'qualifications/npp-1/x.pdf', fileName: 'x.pdf' },
    });
    expect(mockDrop).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

describe('createQualification — what is stored', () => {
  it('stores credits as integer hundredths and the date as a date', async () => {
    signIn('USER', 'npp-1');
    await createQualification({ staffId: 'npp-1', values: VALUES });
    const { data } = tx.qualification.create.mock.calls[0][0];
    expect(data).toMatchObject({
      staffId: 'npp-1',
      kind: 'TRAINING',
      documentType: 'CERTIFICATE',
      series: 'ПК',
      number: '12345',
      creditsHundredths: 150,
      fileKey: null,
    });
    expect(data.issuedOn.toISOString()).toBe('2025-05-20T00:00:00.000Z');
  });

  it('stores an absent series as null', async () => {
    signIn('USER', 'npp-1');
    await createQualification({ staffId: 'npp-1', values: { ...VALUES, series: '' } });
    expect(tx.qualification.create.mock.calls[0][0].data.series).toBeNull();
  });

  it('audits the creation with the caller and a readable label', async () => {
    signIn('ADMIN', 'admin-1');
    await createQualification({ staffId: 'npp-1', values: VALUES });
    const { data } = tx.auditLog.create.mock.calls[0][0];
    expect(data).toMatchObject({
      action: 'CREATE',
      entity: 'Qualification',
      entityId: 'new-1',
      userId: 'admin-1',
      label: 'Петренко П.П. — Цифрові технології в освіті',
    });
    expect(data.changes.credits).toEqual({ from: null, to: 1.5 });
    // Words a person can read, not the enum keys.
    expect(data.changes.kind).toEqual({ from: null, to: 'Підвищення кваліфікації' });
    expect(data.changes.documentType).toEqual({ from: null, to: 'Сертифікат' });
  });

  it('refuses invalid values with the schema’s sentence and writes nothing', async () => {
    signIn('USER', 'npp-1');
    const result = await createQualification({
      staffId: 'npp-1',
      values: { ...VALUES, credits: '-3' },
    });
    expect(result).toEqual({ error: 'Вкажіть кількість кредитів числом' });
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('refuses a date older than the five навчальних років, server-side', async () => {
    signIn('USER', 'npp-1');
    const result = await createQualification({
      staffId: 'npp-1',
      values: { ...VALUES, issuedOn: '2020-01-15' },
    });
    expect('error' in result && result.error).toContain('останні 5 навчальних років');
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('drops the staged scan when the values are invalid', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue(null);
    await createQualification({
      staffId: 'npp-1',
      values: { ...VALUES, number: '' },
      file: { objectKey: 'qualifications/npp-1/x.pdf', fileName: 'x.pdf' },
    });
    expect(mockDrop).toHaveBeenCalledWith(
      'qualifications.dropStaged',
      'qualifications/npp-1/x.pdf',
      expect.anything()
    );
  });
});

describe('createQualification — the file', () => {
  const key = 'qualifications/npp-1/new.pdf';

  it('verifies the stored bytes and records the file columns', async () => {
    signIn('USER', 'npp-1');
    mockVerify.mockResolvedValue(verifiedFile(key));
    await createQualification({
      staffId: 'npp-1',
      values: VALUES,
      file: { objectKey: key, fileName: 'scan.pdf' },
    });
    // The same scan may be attached twice — no university-wide duplicate rule.
    expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({ allowDuplicate: true }));
    expect(tx.qualification.create.mock.calls[0][0].data).toMatchObject({
      fileKey: key,
      fileName: 'scan.pdf',
      fileContentType: 'application/pdf',
      fileSizeBytes: 1000,
      fileSha256: 'abc',
    });
  });

  it('refuses a key from somebody else’s folder, and deletes nothing', async () => {
    signIn('USER', 'npp-1');
    const result = await createQualification({
      staffId: 'npp-1',
      values: VALUES,
      file: { objectKey: 'qualifications/npp-2/theirs.pdf', fileName: 'theirs.pdf' },
    });
    expect('error' in result).toBe(true);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockDrop).not.toHaveBeenCalled();
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('refuses a science evidence key', async () => {
    signIn('USER', 'npp-1');
    const result = await createQualification({
      staffId: 'npp-1',
      values: VALUES,
      file: { objectKey: 'evidence/t1/x.pdf', fileName: 'x.pdf' },
    });
    expect('error' in result).toBe(true);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('reports a file the checks refuse, and saves nothing', async () => {
    signIn('USER', 'npp-1');
    mockVerify.mockResolvedValue({ error: 'Вміст файлу не відповідає заявленому типу' });
    const result = await createQualification({
      staffId: 'npp-1',
      values: VALUES,
      file: { objectKey: key, fileName: 'a.pdf' },
    });
    expect(result).toEqual({ error: 'Вміст файлу не відповідає заявленому типу' });
    expect(tx.qualification.create).not.toHaveBeenCalled();
  });

  it('drops the object when the save itself fails', async () => {
    signIn('USER', 'npp-1');
    mockVerify.mockResolvedValue(verifiedFile(key));
    tx.qualification.create.mockRejectedValue(new Error('db down'));
    const result = await createQualification({
      staffId: 'npp-1',
      values: VALUES,
      file: { objectKey: key, fileName: 'a.pdf' },
    });
    expect('error' in result).toBe(true);
    expect(mockDrop).toHaveBeenCalledWith(
      'qualifications.createQualification',
      key,
      expect.anything()
    );
  });
});

describe('updateQualification', () => {
  beforeEach(() => mockFind.mockResolvedValue(STORED));

  it('lets the owner edit, and audits only what moved', async () => {
    signIn('USER', 'npp-1');
    const result = await updateQualification('q1', { values: VALUES });
    expect(result).toEqual({ ok: true, id: 'q1' });
    const { changes, action } = tx.auditLog.create.mock.calls[0][0].data;
    expect(action).toBe('UPDATE');
    expect(changes).toHaveProperty('topic');
    expect(changes).toHaveProperty('credits');
    expect(changes).not.toHaveProperty('kind');
  });

  it('refuses moving a record to an out-of-window date', async () => {
    signIn('USER', 'npp-1');
    const result = await updateQualification('q1', {
      values: { ...VALUES, issuedOn: '2020-01-15' },
    });
    expect('error' in result).toBe(true);
    expect(tx.qualification.update).not.toHaveBeenCalled();
  });

  it('lets a record from before the window be corrected while keeping its date', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue({ ...STORED, issuedOn: new Date('2021-10-01T00:00:00.000Z') });
    const result = await updateQualification('q1', {
      values: { ...VALUES, issuedOn: '2021-10-01' },
    });
    expect(result).toEqual({ ok: true, id: 'q1' });
  });

  it('refuses another НПП and a read-only EDITOR', async () => {
    signIn('USER', 'npp-2');
    expect(await updateQualification('q1', { values: VALUES })).toEqual({
      error: 'Недостатньо прав',
    });
    signIn('EDITOR', 'ed-1', true);
    expect(await updateQualification('q1', { values: VALUES })).toEqual({
      error: 'Недостатньо прав',
    });
    expect(tx.qualification.update).not.toHaveBeenCalled();
  });

  it('lets ADMIN edit anybody’s', async () => {
    signIn('ADMIN', 'admin-1');
    expect(await updateQualification('q1', { values: VALUES })).toEqual({ ok: true, id: 'q1' });
  });

  it('reports a record that is gone', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue(null);
    expect(await updateQualification('nope', { values: VALUES })).toEqual({
      error: 'Запис не знайдено',
    });
  });

  it('keeps the stored file when none is sent', async () => {
    signIn('USER', 'npp-1');
    await updateQualification('q1', { values: VALUES });
    const { data } = tx.qualification.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('fileKey');
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('takes the file away on null, and deletes the object after the commit', async () => {
    signIn('USER', 'npp-1');
    await updateQualification('q1', { values: VALUES, file: null });
    expect(tx.qualification.update.mock.calls[0][0].data).toMatchObject({
      fileKey: null,
      fileName: null,
    });
    expect(mockDrop).toHaveBeenCalledWith(
      'qualifications.updateQualification',
      'qualifications/npp-1/old.pdf',
      expect.anything()
    );
  });

  it('replaces the file: the new one in, the old object out', async () => {
    signIn('USER', 'npp-1');
    const key = 'qualifications/npp-1/new.pdf';
    mockVerify.mockResolvedValue(verifiedFile(key));
    await updateQualification('q1', {
      values: VALUES,
      file: { objectKey: key, fileName: 'new.pdf' },
    });
    expect(tx.qualification.update.mock.calls[0][0].data.fileKey).toBe(key);
    expect(mockDrop).toHaveBeenCalledWith(
      'qualifications.updateQualification',
      'qualifications/npp-1/old.pdf',
      expect.anything()
    );
    expect(mockDrop).not.toHaveBeenCalledWith(expect.anything(), key, expect.anything());
  });

  it('keeps the old file when the replacement is refused', async () => {
    signIn('USER', 'npp-1');
    mockVerify.mockResolvedValue({ error: 'Файл порожній' });
    const result = await updateQualification('q1', {
      values: VALUES,
      file: { objectKey: 'qualifications/npp-1/new.pdf', fileName: 'new.pdf' },
    });
    expect(result).toEqual({ error: 'Файл порожній' });
    expect(tx.qualification.update).not.toHaveBeenCalled();
    expect(mockDrop).not.toHaveBeenCalled();
  });
});

describe('deleteQualification', () => {
  beforeEach(() => mockFind.mockResolvedValue(STORED));

  it('lets the owner delete, removing the row, the audit trail and the object', async () => {
    signIn('USER', 'npp-1');
    expect(await deleteQualification('q1')).toEqual({ ok: true });
    expect(tx.qualification.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'DELETE',
      entity: 'Qualification',
    });
    expect(mockDrop).toHaveBeenCalledWith(
      'qualifications.deleteQualification',
      'qualifications/npp-1/old.pdf',
      expect.anything()
    );
  });

  it('lets ADMIN delete anybody’s', async () => {
    signIn('ADMIN', 'admin-1');
    expect(await deleteQualification('q1')).toEqual({ ok: true });
  });

  it('refuses another НПП and a read-only EDITOR', async () => {
    signIn('USER', 'npp-2');
    expect(await deleteQualification('q1')).toEqual({ error: 'Недостатньо прав' });
    signIn('EDITOR', 'ed-1', true);
    expect(await deleteQualification('q1')).toEqual({ error: 'Недостатньо прав' });
    expect(tx.qualification.delete).not.toHaveBeenCalled();
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('does not touch R2 when the row had no file', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue({ ...STORED, fileKey: null });
    await deleteQualification('q1');
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('keeps the object when the delete itself fails', async () => {
    signIn('USER', 'npp-1');
    tx.qualification.delete.mockRejectedValue(new Error('db down'));
    const result = await deleteQualification('q1');
    expect('error' in result).toBe(true);
    expect(mockDrop).not.toHaveBeenCalled();
  });
});
