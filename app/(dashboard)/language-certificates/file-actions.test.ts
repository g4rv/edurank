import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { languageCertificate: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/log', () => ({ logError: vi.fn(), logWarning: vi.fn() }));
vi.mock('@/lib/language-certificates/access', () => ({
  authoriseCertificateWrite: vi.fn(),
}));
vi.mock('@/lib/qualifications/guard', () => ({ authoriseQualifications: vi.fn() }));
vi.mock('@/lib/science/r2', async () => {
  const actual = await vi.importActual<typeof import('@/lib/science/r2')>('@/lib/science/r2');
  return { ...actual, presignPut: vi.fn(), presignGet: vi.fn() };
});
vi.mock('@/lib/science/file-intake', () => ({ safeDeleteObject: vi.fn() }));

import { db } from '@/lib/db';
import { authoriseCertificateWrite } from '@/lib/language-certificates/access';
import { authoriseQualifications } from '@/lib/qualifications/guard';
import { presignGet, presignPut } from '@/lib/science/r2';
import { safeDeleteObject } from '@/lib/science/file-intake';
import {
  discardCertificateUpload,
  languageCertificateFileUrl,
  presignCertificateUpload,
} from './file-actions';

const mockWrite = authoriseCertificateWrite as unknown as Mock;
const mockRead = authoriseQualifications as unknown as Mock;
const mockFind = db.languageCertificate.findUnique as unknown as Mock;
const mockPut = presignPut as unknown as Mock;
const mockGet = presignGet as unknown as Mock;
const mockDrop = safeDeleteObject as unknown as Mock;

const PDF = { fileName: 'scan.pdf', contentType: 'application/pdf', sizeBytes: 1000 };
const DENIED = { error: 'Недостатньо прав' };

beforeEach(() => {
  vi.clearAllMocks();
  mockWrite.mockResolvedValue({ ok: true, userId: 'u1' });
  mockRead.mockResolvedValue({ ok: true, caller: { userId: 'u1' } });
  mockPut.mockResolvedValue('https://r2/put');
  mockGet.mockResolvedValue('https://r2/get');
});

describe('presignCertificateUpload', () => {
  it('mints a key in the owner’s language-certificates folder', async () => {
    const result = await presignCertificateUpload({
      staffId: 'npp-1',
      kind: 'ENGLISH',
      ...PDF,
    });
    expect(result).toMatchObject({ ok: true, url: 'https://r2/put' });
    expect('objectKey' in result && result.objectKey).toMatch(
      /^language-certificates\/npp-1\/[0-9a-f-]+\.pdf$/
    );
    // The write rule is asked for THIS certificate.
    expect(mockWrite).toHaveBeenCalledWith('npp-1', 'ENGLISH');
  });

  it('refuses whoever may not write, before signing anything', async () => {
    mockWrite.mockResolvedValue(DENIED);
    expect(await presignCertificateUpload({ staffId: 'npp-1', kind: 'UKRAINIAN', ...PDF })).toEqual(
      DENIED
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('refuses an unknown kind without asking anybody', async () => {
    const result = await presignCertificateUpload({
      staffId: 'npp-1',
      kind: 'FRENCH' as never,
      ...PDF,
    });
    expect('error' in result).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('refuses a type outside PDF/JPG/PNG and an oversized file', async () => {
    expect(
      await presignCertificateUpload({
        staffId: 'npp-1',
        kind: 'ENGLISH',
        ...PDF,
        contentType: 'application/zip',
      })
    ).toEqual({ error: 'Підтримуються лише PDF, JPG і PNG' });
    const big = await presignCertificateUpload({
      staffId: 'npp-1',
      kind: 'ENGLISH',
      ...PDF,
      sizeBytes: 11 * 1024 * 1024,
    });
    expect('error' in big).toBe(true);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('turns an R2 failure into a sentence, not an exception', async () => {
    mockPut.mockRejectedValue(new Error('no credentials'));
    expect(await presignCertificateUpload({ staffId: 'npp-1', kind: 'ENGLISH', ...PDF })).toEqual({
      error: 'Не вдалося підготувати завантаження файлу',
    });
  });
});

describe('discardCertificateUpload', () => {
  const key = 'language-certificates/npp-1/x.pdf';

  it('deletes an unreferenced object in the caller’s own folder', async () => {
    mockFind.mockResolvedValue(null);
    await discardCertificateUpload('npp-1', 'ENGLISH', key);
    expect(mockDrop).toHaveBeenCalledWith('languageCertificates.discardUpload', key, {
      userId: 'u1',
    });
  });

  it('never touches an object a certificate holds', async () => {
    mockFind.mockResolvedValue({ id: 'c1' });
    await discardCertificateUpload('npp-1', 'ENGLISH', key);
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('never touches another folder, or anything for a caller who may not write', async () => {
    mockFind.mockResolvedValue(null);
    await discardCertificateUpload('npp-1', 'ENGLISH', 'language-certificates/npp-2/x.pdf');
    await discardCertificateUpload('npp-1', 'ENGLISH', 'qualifications/npp-1/x.pdf');
    mockWrite.mockResolvedValue(DENIED);
    await discardCertificateUpload('npp-1', 'ENGLISH', key);
    expect(mockDrop).not.toHaveBeenCalled();
  });
});

describe('languageCertificateFileUrl', () => {
  it('signs a link for whoever may READ the records, asking the qualifications rule', async () => {
    mockFind.mockResolvedValue({ fileKey: 'language-certificates/npp-1/x.pdf' });
    expect(await languageCertificateFileUrl('npp-1', 'ENGLISH')).toEqual({
      ok: true,
      url: 'https://r2/get',
    });
    expect(mockRead).toHaveBeenCalledWith('npp-1', 'read');
    expect(mockFind).toHaveBeenCalledWith({
      where: { staffId_kind: { staffId: 'npp-1', kind: 'ENGLISH' } },
      select: { fileKey: true },
    });
  });

  it('refuses everybody else without signing', async () => {
    mockRead.mockResolvedValue(DENIED);
    expect(await languageCertificateFileUrl('npp-1', 'ENGLISH')).toEqual({
      error: 'У вас немає доступу до цього файлу',
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('says when there is no certificate, or no scan on it', async () => {
    mockFind.mockResolvedValue(null);
    expect(await languageCertificateFileUrl('npp-1', 'ENGLISH')).toEqual({
      error: 'Сертифікат не знайдено',
    });
    mockFind.mockResolvedValue({ fileKey: null });
    expect(await languageCertificateFileUrl('npp-1', 'ENGLISH')).toEqual({
      error: 'До цього сертифіката файл не додано',
    });
  });

  it('refuses an unknown kind', async () => {
    expect(await languageCertificateFileUrl('npp-1', 'FRENCH' as never)).toEqual({
      error: 'Сертифікат не знайдено',
    });
    expect(mockRead).not.toHaveBeenCalled();
  });
});
