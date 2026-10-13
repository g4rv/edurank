import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { staff: { findUnique: vi.fn() }, qualification: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/science/r2', async () => {
  const actual = await vi.importActual<typeof import('@/lib/science/r2')>('@/lib/science/r2');
  return { ...actual, presignPut: vi.fn(), presignGet: vi.fn() };
});
vi.mock('@/lib/science/file-intake', () => ({ safeDeleteObject: vi.fn() }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(), logWarning: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { presignGet, presignPut } from '@/lib/science/r2';
import { safeDeleteObject } from '@/lib/science/file-intake';
import {
  discardQualificationUpload,
  presignQualificationUpload,
  qualificationFileUrl,
} from './file-actions';

const mockAuth = auth as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;
const mockFind = db.qualification.findUnique as unknown as Mock;
const mockPut = presignPut as unknown as Mock;
const mockGet = presignGet as unknown as Mock;
const mockDrop = safeDeleteObject as unknown as Mock;

function signIn(role: 'ADMIN' | 'EDITOR' | 'USER', staffId: string, divisionAllows = false) {
  mockAuth.mockResolvedValue({ user: { id: staffId, role, staffId } });
  mockStaff.mockImplementation(async (args: { where: { id: string }; select?: object }) =>
    'division' in (args.select ?? {})
      ? { division: { canViewQualifications: divisionAllows } }
      : { id: args.where.id, isNpp: true, lastName: 'П', firstName: 'П', patronymic: 'П' }
  );
}

const PDF = { fileName: 'scan.pdf', contentType: 'application/pdf', sizeBytes: 1000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockPut.mockResolvedValue('https://r2/put');
  mockGet.mockResolvedValue('https://r2/get');
});

describe('presignQualificationUpload', () => {
  it('mints a key in the owner’s own folder', async () => {
    signIn('USER', 'npp-1');
    const result = await presignQualificationUpload({ staffId: 'npp-1', ...PDF });
    expect(result).toMatchObject({ ok: true, url: 'https://r2/put' });
    expect('objectKey' in result && result.objectKey).toMatch(
      /^qualifications\/npp-1\/[0-9a-f-]+\.pdf$/
    );
  });

  it('lets ADMIN mint one in anybody’s folder', async () => {
    signIn('ADMIN', 'admin-1');
    const result = await presignQualificationUpload({ staffId: 'npp-1', ...PDF });
    expect('objectKey' in result && result.objectKey.startsWith('qualifications/npp-1/')).toBe(
      true
    );
  });

  it('refuses another НПП and a read-only EDITOR', async () => {
    signIn('USER', 'npp-2');
    expect(await presignQualificationUpload({ staffId: 'npp-1', ...PDF })).toEqual({
      error: 'Недостатньо прав',
    });
    signIn('EDITOR', 'ed-1', true);
    expect(await presignQualificationUpload({ staffId: 'npp-1', ...PDF })).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('refuses a type outside PDF/JPG/PNG and an oversized file', async () => {
    signIn('USER', 'npp-1');
    expect(
      await presignQualificationUpload({
        staffId: 'npp-1',
        ...PDF,
        contentType: 'application/zip',
      })
    ).toEqual({ error: 'Підтримуються лише PDF, JPG і PNG' });
    const big = await presignQualificationUpload({
      staffId: 'npp-1',
      ...PDF,
      sizeBytes: 11 * 1024 * 1024,
    });
    expect('error' in big).toBe(true);
  });

  it('turns an R2 failure into a sentence, not an exception', async () => {
    signIn('USER', 'npp-1');
    mockPut.mockRejectedValue(new Error('no credentials'));
    expect(await presignQualificationUpload({ staffId: 'npp-1', ...PDF })).toEqual({
      error: 'Не вдалося підготувати завантаження файлу',
    });
  });
});

describe('discardQualificationUpload', () => {
  it('deletes an unreferenced object in the caller’s own folder', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue(null);
    await discardQualificationUpload('npp-1', 'qualifications/npp-1/x.pdf');
    expect(mockDrop).toHaveBeenCalledWith(
      'qualifications.discardUpload',
      'qualifications/npp-1/x.pdf',
      expect.anything()
    );
  });

  it('never touches an object a record holds', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue({ id: 'q1' });
    await discardQualificationUpload('npp-1', 'qualifications/npp-1/x.pdf');
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('never touches another person’s folder, or one the caller may not write', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue(null);
    await discardQualificationUpload('npp-1', 'qualifications/npp-2/x.pdf');
    await discardQualificationUpload('npp-2', 'qualifications/npp-2/x.pdf');
    expect(mockDrop).not.toHaveBeenCalled();
  });
});

describe('qualificationFileUrl', () => {
  const ROW = { staffId: 'npp-1', fileKey: 'qualifications/npp-1/x.pdf' };
  beforeEach(() => mockFind.mockResolvedValue(ROW));

  it('signs a link for the owner and for ADMIN', async () => {
    signIn('USER', 'npp-1');
    expect(await qualificationFileUrl('q1')).toEqual({ ok: true, url: 'https://r2/get' });
    signIn('ADMIN', 'admin-1');
    expect(await qualificationFileUrl('q1')).toEqual({ ok: true, url: 'https://r2/get' });
  });

  it('signs a link for an EDITOR whose division holds the switch', async () => {
    signIn('EDITOR', 'ed-1', true);
    expect(await qualificationFileUrl('q1')).toEqual({ ok: true, url: 'https://r2/get' });
  });

  it('refuses an EDITOR without the switch, another НПП, and a head', async () => {
    for (const [role, id, allows] of [
      ['EDITOR', 'ed-1', false],
      ['USER', 'npp-2', false],
      ['USER', 'head-1', true],
    ] as const) {
      signIn(role, id, allows);
      expect(await qualificationFileUrl('q1')).toEqual({
        error: 'У вас немає доступу до цього файлу',
      });
    }
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('says when there is no file or no record', async () => {
    signIn('USER', 'npp-1');
    mockFind.mockResolvedValue({ ...ROW, fileKey: null });
    expect(await qualificationFileUrl('q1')).toEqual({ error: 'До цього запису файл не додано' });
    mockFind.mockResolvedValue(null);
    expect(await qualificationFileUrl('q1')).toEqual({ error: 'Запис не знайдено' });
  });
});
