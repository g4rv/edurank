import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/science/file-intake', () => ({
  verifyUploadedObject: vi.fn(),
  safeDeleteObject: vi.fn(),
}));

import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
import {
  applyCertificates,
  certificateSummary,
  dropObjects,
  hasCertificateChanges,
  prepareCertificates,
  takeCertificates,
  type PreparedCertificate,
} from './language-certificates';

const mockVerify = verifyUploadedObject as unknown as Mock;
const mockDrop = safeDeleteObject as unknown as Mock;

const english = {
  series: 'EN',
  number: '123',
  issuedBy: 'British Council',
  issuedOn: '2024-03-15',
};

const ukrainian = {
  series: null,
  number: '777',
  level: 'B2',
  decisionNumber: '12/3',
  decisionDate: '2023-06-01',
  issuedOn: '2023-07-10',
};

const verified = (key: string) => ({
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

beforeEach(() => vi.clearAllMocks());

describe('takeCertificates', () => {
  it('lifts the sent certificates out of the payload and nothing else', () => {
    const payload: Record<string, unknown> = {
      phone: '+380501234567',
      englishCertificate: english,
      ukrainianCertificate: null,
    };
    const taken = takeCertificates(payload);
    expect(taken).toEqual({ ENGLISH: english, UKRAINIAN: null });
    expect(payload).toEqual({ phone: '+380501234567' });
  });

  it('leaves out a kind the form did not carry', () => {
    const payload: Record<string, unknown> = { englishCertificate: english };
    expect(Object.keys(takeCertificates(payload))).toEqual(['ENGLISH']);
    expect(takeCertificates({ phone: 'x' })).toEqual({});
  });

  it('reports whether anything was sent', () => {
    expect(hasCertificateChanges({})).toBe(false);
    expect(hasCertificateChanges({ UKRAINIAN: null })).toBe(true);
  });
});

describe('certificateSummary', () => {
  it('reads an English certificate as one line', () => {
    expect(
      certificateSummary(
        'ENGLISH',
        { ...english, level: null, decisionNumber: null, decisionDate: null },
        null
      )
    ).toBe('EN № 123 · British Council · 15.03.2024');
  });

  it('prints the English level too (B2 and up)', () => {
    expect(
      certificateSummary(
        'ENGLISH',
        { ...english, level: 'C1', decisionNumber: null, decisionDate: null },
        null
      )
    ).toBe('EN № 123 · рівень C1 · British Council · 15.03.2024');
  });

  it('puts the level and the commission decision on a Ukrainian one, and the file last', () => {
    expect(certificateSummary('UKRAINIAN', { ...ukrainian, issuedBy: null }, 'scan.pdf')).toBe(
      '№ 777 · рівень B2 · рішення № 12/3 від 01.06.2023 · 10.07.2023 · файл: scan.pdf'
    );
  });
});

describe('prepareCertificates', () => {
  const base = { staffId: 's1', userId: 'u1', scope: 'test' };

  it('passes an emptied block through as «delete»', async () => {
    const result = await prepareCertificates({ ...base, changes: { ENGLISH: null } });
    expect(result).toEqual({
      ok: true,
      prepared: [{ kind: 'ENGLISH', values: null, file: undefined }],
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('keeps the stored scan when none was sent, and removes it on null', async () => {
    const result = await prepareCertificates({
      ...base,
      changes: { ENGLISH: english, UKRAINIAN: { ...ukrainian, file: null } } as never,
    });
    expect(result).toMatchObject({
      ok: true,
      prepared: [
        { kind: 'ENGLISH', file: undefined },
        { kind: 'UKRAINIAN', file: null },
      ],
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('verifies a staged scan from its stored bytes, allowing a repeated file', async () => {
    const key = 'language-certificates/s1/a.pdf';
    mockVerify.mockResolvedValue(verified(key));
    const result = await prepareCertificates({
      ...base,
      changes: { ENGLISH: { ...english, file: { objectKey: key, fileName: 'a.pdf' } } } as never,
    });
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: key, allowDuplicate: true })
    );
    expect(result).toMatchObject({ ok: true, prepared: [{ kind: 'ENGLISH' }] });
    expect('prepared' in result && result.prepared[0].file?.objectKey).toBe(key);
  });

  it('refuses a key from somebody else’s folder, verifying and deleting nothing', async () => {
    const result = await prepareCertificates({
      ...base,
      changes: {
        ENGLISH: {
          ...english,
          file: { objectKey: 'language-certificates/s2/theirs.pdf', fileName: 'x.pdf' },
        },
      } as never,
    });
    expect('error' in result).toBe(true);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('refuses a qualification or science key', async () => {
    for (const objectKey of ['qualifications/s1/a.pdf', 'evidence/t1/a.pdf']) {
      const result = await prepareCertificates({
        ...base,
        changes: { ENGLISH: { ...english, file: { objectKey, fileName: 'x.pdf' } } } as never,
      });
      expect('error' in result).toBe(true);
    }
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('drops the first scan when the second is refused', async () => {
    const first = 'language-certificates/s1/first.pdf';
    mockVerify
      .mockResolvedValueOnce(verified(first))
      .mockResolvedValueOnce({ error: 'Файл порожній' });
    const result = await prepareCertificates({
      ...base,
      changes: {
        ENGLISH: { ...english, file: { objectKey: first, fileName: 'a.pdf' } },
        UKRAINIAN: {
          ...ukrainian,
          file: { objectKey: 'language-certificates/s1/second.pdf', fileName: 'b.pdf' },
        },
      } as never,
    });
    expect(result).toEqual({ error: 'Файл порожній' });
    expect(mockDrop).toHaveBeenCalledWith('test', first, expect.anything());
  });
});

describe('applyCertificates', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    kind: 'ENGLISH',
    series: 'EN',
    number: '123',
    issuedOn: new Date('2024-03-15T00:00:00.000Z'),
    issuedBy: 'British Council',
    level: null,
    decisionNumber: null,
    decisionDate: null,
    fileKey: null,
    fileName: null,
    ...over,
  });

  function fakeTx(rows: ReturnType<typeof stored>[]) {
    return {
      languageCertificate: {
        findMany: vi.fn(async () => rows),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    };
  }
  const run = (tx: ReturnType<typeof fakeTx>, prepared: PreparedCertificate[]) =>
    applyCertificates(tx as never, 's1', prepared);

  it('creates a certificate and audits it as a new line', async () => {
    const tx = fakeTx([]);
    const result = await run(tx, [{ kind: 'ENGLISH', values: english as never, file: undefined }]);
    const call = tx.languageCertificate.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ staffId_kind: { staffId: 's1', kind: 'ENGLISH' } });
    expect(call.create).toMatchObject({
      staffId: 's1',
      kind: 'ENGLISH',
      series: 'EN',
      number: '123',
      issuedBy: 'British Council',
      level: null,
      decisionNumber: null,
      decisionDate: null,
      fileKey: null,
    });
    expect((call.create.issuedOn as Date).toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(result.changes.englishCertificate).toEqual({
      from: null,
      to: 'EN № 123 · British Council · 15.03.2024',
    });
    expect(result.orphaned).toEqual([]);
  });

  it('stores the English level on the row, and nothing of the Ukrainian decision', async () => {
    const tx = fakeTx([]);
    await run(tx, [
      { kind: 'ENGLISH', values: { ...english, level: 'C1' } as never, file: undefined },
    ]);
    expect(tx.languageCertificate.upsert.mock.calls[0][0].create).toMatchObject({
      kind: 'ENGLISH',
      level: 'C1',
      issuedBy: 'British Council',
      decisionNumber: null,
      decisionDate: null,
    });
  });

  it('stores a Ukrainian certificate with its level and decision, and no «ким виданий»', async () => {
    const tx = fakeTx([]);
    await run(tx, [{ kind: 'UKRAINIAN', values: ukrainian as never, file: undefined }]);
    const create = tx.languageCertificate.upsert.mock.calls[0][0].create;
    expect(create).toMatchObject({
      kind: 'UKRAINIAN',
      level: 'B2',
      decisionNumber: '12/3',
      issuedBy: null,
    });
    expect((create.decisionDate as Date).toISOString()).toBe('2023-06-01T00:00:00.000Z');
  });

  it('writes no audit line for a save that changed nothing', async () => {
    const tx = fakeTx([stored()]);
    const result = await run(tx, [{ kind: 'ENGLISH', values: english as never, file: undefined }]);
    expect(result.changes).toEqual({});
  });

  it('keeps the stored scan when none was sent — and does not touch its columns', async () => {
    const tx = fakeTx([
      stored({ fileKey: 'language-certificates/s1/old.pdf', fileName: 'old.pdf' }),
    ]);
    const result = await run(tx, [
      { kind: 'ENGLISH', values: { ...english, number: '999' } as never, file: undefined },
    ]);
    const update = tx.languageCertificate.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('fileKey');
    expect(result.orphaned).toEqual([]);
    expect(result.changes.englishCertificate.to).toContain('файл: old.pdf');
  });

  it('replaces a scan: the new one in, the old object left to delete', async () => {
    const tx = fakeTx([
      stored({ fileKey: 'language-certificates/s1/old.pdf', fileName: 'old.pdf' }),
    ]);
    const result = await run(tx, [
      {
        kind: 'ENGLISH',
        values: english as never,
        file: verified('language-certificates/s1/new.pdf').file,
      },
    ]);
    expect(tx.languageCertificate.upsert.mock.calls[0][0].update.fileKey).toBe(
      'language-certificates/s1/new.pdf'
    );
    expect(result.orphaned).toEqual(['language-certificates/s1/old.pdf']);
  });

  it('takes a scan away on null', async () => {
    const tx = fakeTx([
      stored({ fileKey: 'language-certificates/s1/old.pdf', fileName: 'old.pdf' }),
    ]);
    const result = await run(tx, [{ kind: 'ENGLISH', values: english as never, file: null }]);
    expect(tx.languageCertificate.upsert.mock.calls[0][0].update).toMatchObject({
      fileKey: null,
      fileName: null,
    });
    expect(result.orphaned).toEqual(['language-certificates/s1/old.pdf']);
    expect(result.changes.englishCertificate.to).not.toContain('файл');
  });

  it('deletes an emptied certificate with its scan', async () => {
    const tx = fakeTx([
      stored({ fileKey: 'language-certificates/s1/old.pdf', fileName: 'old.pdf' }),
    ]);
    const result = await run(tx, [{ kind: 'ENGLISH', values: null, file: undefined }]);
    expect(tx.languageCertificate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(tx.languageCertificate.upsert).not.toHaveBeenCalled();
    expect(result.orphaned).toEqual(['language-certificates/s1/old.pdf']);
    expect(result.changes.englishCertificate.to).toBeNull();
  });

  it('emptying a certificate nobody had is nothing', async () => {
    const tx = fakeTx([]);
    const result = await run(tx, [{ kind: 'UKRAINIAN', values: null, file: undefined }]);
    expect(tx.languageCertificate.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: {}, orphaned: [] });
  });

  it('does not even read the table when there is nothing to apply', async () => {
    const tx = fakeTx([]);
    expect(await run(tx, [])).toEqual({ changes: {}, orphaned: [] });
    expect(tx.languageCertificate.findMany).not.toHaveBeenCalled();
  });
});

describe('dropObjects', () => {
  it('deletes every key through the best-effort helper', async () => {
    await dropObjects('scope', ['a', 'b'], { userId: 'u', entityId: 'e' });
    expect(mockDrop).toHaveBeenCalledTimes(2);
    expect(mockDrop).toHaveBeenCalledWith('scope', 'a', { userId: 'u', entityId: 'e' });
  });
});
