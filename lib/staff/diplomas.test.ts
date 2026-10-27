import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/science/file-intake', () => ({
  verifyUploadedObject: vi.fn(),
  safeDeleteObject: vi.fn().mockResolvedValue(undefined),
}));

import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
import type { VerifiedFile } from '@/lib/science/file-intake';
import type { DegreeRecord } from '@/lib/staff/academic';
import { prepareDiplomaScans, withoutScans, writeDiplomas } from './diplomas';

const record = (over: Partial<DegreeRecord> = {}): DegreeRecord => ({
  degree: 'cand_history',
  specialty: 'Історія',
  defenceDate: '2015-06-01',
  matchesDepartment: true,
  issuedBy: 'ХНУ',
  series: null,
  number: '012345',
  issueDate: '2015-10-01',
  basicLevel: null,
  topic: 'Тема',
  ...over,
});

type Stored = { id: string; fileKey: string | null; fileName: string | null; position: number };

function mockTx(stored: Stored[] = []) {
  return {
    diploma: {
      findMany: vi.fn().mockResolvedValue(stored),
      deleteMany: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}
const write = (tx: ReturnType<typeof mockTx>, records: DegreeRecord[], verified = new Map()) =>
  writeDiplomas(tx as never, 'staff-1', records, verified);

const scan = (key: string, name = 'диплом.jpg'): VerifiedFile => ({
  objectKey: key,
  fileName: name,
  contentType: 'image/jpeg',
  sizeBytes: 1000,
  pageCount: null,
  sha256: 'abc',
});

describe('writeDiplomas — in place, by id (owner, 2026-10-27)', () => {
  it('updates a stored row in place and leaves its scan alone when the form says nothing about it', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg', position: 0 },
    ]);
    const result = await write(tx, [record({ id: 'd1', specialty: 'Нова' })]);

    expect(tx.diploma.deleteMany).not.toHaveBeenCalled();
    expect(tx.diploma.create).not.toHaveBeenCalled();
    const data = tx.diploma.update.mock.calls[0][0].data;
    expect(tx.diploma.update.mock.calls[0][0].where).toEqual({ id: 'd1' });
    expect(data.specialty).toBe('Нова');
    // The phone-number save that used to wipe a scan: no file column is written
    expect(data).not.toHaveProperty('fileKey');
    expect(result).toEqual({ orphaned: [], scans: null });
  });

  it("never writes into another person's row — an id it does not own is a new entry", async () => {
    const tx = mockTx([]);
    await write(tx, [record({ id: 'someone-elses' })]);
    expect(tx.diploma.update).not.toHaveBeenCalled();
    expect(tx.diploma.create.mock.calls[0][0].data.staffId).toBe('staff-1');
  });

  it('deletes a row no entry names, first, and lets its scan go', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: null, fileName: null, position: 0 },
      { id: 'd2', fileKey: 'diplomas/staff-1/b.jpg', fileName: 'b.jpg', position: 1 },
    ]);
    const result = await write(tx, [record({ id: 'd1' })]);
    expect(tx.diploma.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d2'] } } });
    expect(tx.diploma.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.diploma.update.mock.invocationCallOrder[0]
    );
    expect(result.orphaned).toEqual(['diplomas/staff-1/b.jpg']);
    expect(result.scans).toEqual({ from: 'b.jpg', to: null });
  });

  it('writes a form with no ids (opened before them) exactly as before: all anew, in order', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: null, fileName: null, position: 0 },
      { id: 'd2', fileKey: null, fileName: null, position: 1 },
    ]);
    await write(tx, [record({ degree: 'doc_history' }), record()]);
    expect(tx.diploma.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'd2'] } } });
    expect(tx.diploma.create.mock.calls.map((c) => [c[0].data.position, c[0].data.degree])).toEqual(
      [
        [0, 'doc_history'],
        [1, 'cand_history'],
      ]
    );
  });

  it('keeps the new order when entries move', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: null, fileName: null, position: 0 },
      { id: 'd2', fileKey: null, fileName: null, position: 1 },
    ]);
    await write(tx, [record({ id: 'd2' }), record({ id: 'd1' })]);
    expect(tx.diploma.update.mock.calls.map((c) => [c[0].where.id, c[0].data.position])).toEqual([
      ['d2', 0],
      ['d1', 1],
    ]);
  });

  it('takes a scan away on `file: null`', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg', position: 0 },
    ]);
    const result = await write(tx, [record({ id: 'd1', file: null })]);
    expect(tx.diploma.update.mock.calls[0][0].data.fileKey).toBeNull();
    expect(result).toEqual({
      orphaned: ['diplomas/staff-1/a.jpg'],
      scans: { from: 'a.jpg', to: null },
    });
  });

  it('puts in a verified scan, replacing the old one', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg', position: 0 },
    ]);
    const staged = { objectKey: 'diplomas/staff-1/new.jpg', fileName: 'новий.jpg' };
    const result = await write(
      tx,
      [record({ id: 'd1', file: staged })],
      new Map([[staged.objectKey, scan(staged.objectKey, 'новий.jpg')]])
    );
    expect(tx.diploma.update.mock.calls[0][0].data).toMatchObject({
      fileKey: 'diplomas/staff-1/new.jpg',
      fileName: 'новий.jpg',
      fileContentType: 'image/jpeg',
    });
    expect(result).toEqual({
      orphaned: ['diplomas/staff-1/a.jpg'],
      scans: { from: 'a.jpg', to: 'новий.jpg' },
    });
  });

  it('refuses to write a staged key nobody verified', async () => {
    const tx = mockTx([]);
    await expect(
      write(tx, [record({ file: { objectKey: 'diplomas/staff-1/x.jpg', fileName: 'x.jpg' } })])
    ).rejects.toThrow('not verified');
  });

  it('never keeps a scan on a basic education', async () => {
    const tx = mockTx([
      { id: 'd1', fileKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg', position: 0 },
    ]);
    const result = await write(tx, [
      record({ id: 'd1', degree: 'basic_education', basicLevel: 'master', topic: null }),
    ]);
    expect(tx.diploma.update.mock.calls[0][0].data.fileKey).toBeNull();
    expect(result.orphaned).toEqual(['diplomas/staff-1/a.jpg']);
  });
});

describe('withoutScans — a new person has no folder yet', () => {
  it('drops the ids and the staged scans', () => {
    expect(
      withoutScans([record({ id: 'd1', file: { objectKey: 'k', fileName: 'f' } })])[0]
    ).toMatchObject({ id: null, file: undefined });
  });
});

describe('prepareDiplomaScans — checked from the stored bytes, JPG only', () => {
  const mockVerify = verifyUploadedObject as unknown as Mock;
  const mockDrop = safeDeleteObject as unknown as Mock;
  const prepare = (records: DegreeRecord[]) =>
    prepareDiplomaScans({ staffId: 'staff-1', userId: 'u1', records, scope: 'test' });

  beforeEach(() => vi.clearAllMocks());

  it('verifies a staged JPG and hands it on by its key', async () => {
    mockVerify.mockResolvedValue({ file: scan('diplomas/staff-1/a.jpg') });
    const result = await prepare([
      record({ file: { objectKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg' } }),
    ]);
    expect(result).toMatchObject({ ok: true });
    expect('verified' in result && [...result.verified.keys()]).toEqual(['diplomas/staff-1/a.jpg']);
  });

  it("refuses a key from somebody else's folder, without touching it", async () => {
    const result = await prepare([
      record({ file: { objectKey: 'diplomas/staff-2/a.jpg', fileName: 'a.jpg' } }),
    ]);
    expect(result).toEqual({ error: 'Файл не знайдено. Спробуйте завантажити ще раз' });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('refuses a file that is not really a JPG, and drops it', async () => {
    mockVerify.mockResolvedValue({
      file: { ...scan('diplomas/staff-1/a.jpg'), contentType: 'image/png' },
    });
    const result = await prepare([
      record({ file: { objectKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg' } }),
    ]);
    expect(result).toEqual({ error: 'Скан диплома — лише у форматі JPG' });
    expect(mockDrop).toHaveBeenCalledWith('test', 'diplomas/staff-1/a.jpg', expect.anything());
  });

  it('ignores entries with no staged scan, and a basic education', async () => {
    const result = await prepare([
      record(),
      record({
        degree: 'basic_education',
        file: { objectKey: 'diplomas/staff-1/a.jpg', fileName: 'a.jpg' },
      }),
    ]);
    expect(result).toMatchObject({ ok: true });
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
