import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    staff: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/science/r2', () => ({
  presignPut: vi.fn(),
  headObject: vi.fn(),
  getObjectBytes: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('@/lib/log', () => ({ logError: vi.fn(), logWarning: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import * as r2 from '@/lib/science/r2';
import { presignAvatar, saveAvatar } from './avatar-actions';

const mockAuth = auth as unknown as Mock;
const mockPresign = r2.presignPut as unknown as Mock;
const mockHead = r2.headObject as unknown as Mock;
const mockBytes = r2.getObjectBytes as unknown as Mock;
const mockDelete = r2.deleteObject as unknown as Mock;
const staffFind = db.staff.findUnique as unknown as Mock;
const staffUpdate = db.staff.update as unknown as Mock;
const auditCreate = db.auditLog.create as unknown as Mock;

const ADMIN = { user: { id: 'u1', role: 'ADMIN', staffId: 's1' } };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.7');

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ADMIN);
  mockPresign.mockResolvedValue('https://r2.example/put');
  staffFind.mockResolvedValue({
    lastName: 'Адмін',
    firstName: 'Адмін',
    patronymic: 'Адмінович',
    avatarKey: null,
  });
});

describe('presignAvatar', () => {
  it('gives an ADMIN an upload URL for a key inside their own folder', async () => {
    const result = await presignAvatar({ contentType: 'image/jpeg', sizeBytes: 1000 });
    expect(result).toMatchObject({ ok: true, url: 'https://r2.example/put' });
    expect((result as { objectKey: string }).objectKey).toMatch(/^avatars\/s1\/.+\.jpg$/);
  });

  it('refuses anybody who is not an ADMIN, and never asks R2', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'USER', staffId: 's2' } });
    expect(await presignAvatar({ contentType: 'image/jpeg', sizeBytes: 1000 })).toEqual({
      error: 'У вас немає доступу до цієї дії',
    });
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('refuses a wrong type and an oversized file before touching R2', async () => {
    expect(await presignAvatar({ contentType: 'application/pdf', sizeBytes: 1000 })).toHaveProperty(
      'error'
    );
    expect(
      await presignAvatar({ contentType: 'image/png', sizeBytes: 50 * 1024 * 1024 })
    ).toHaveProperty('error');
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('says so in plain words when R2 is misconfigured, without leaking the cause', async () => {
    mockPresign.mockRejectedValue(new Error('NoSuchBucket'));
    expect(await presignAvatar({ contentType: 'image/png', sizeBytes: 1000 })).toEqual({
      error: 'Не вдалося підготувати завантаження фото',
    });
  });
});

describe('saveAvatar', () => {
  it('refuses a key that is not in the caller own folder, and changes nothing', async () => {
    expect(await saveAvatar({ objectKey: 'avatars/s2/x.jpg' })).toEqual({
      error: 'Некоректне фото',
    });
    expect(await saveAvatar({ objectKey: 'evidence/t1/x.jpg' })).toHaveProperty('error');
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it('refuses an object that was never uploaded', async () => {
    mockHead.mockResolvedValue(null);
    expect(await saveAvatar({ objectKey: 'avatars/s1/x.jpg' })).toHaveProperty('error');
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it('deletes and refuses an object whose real bytes are not a photo', async () => {
    mockHead.mockResolvedValue({ sizeBytes: 800, contentType: 'image/jpeg' });
    mockBytes.mockResolvedValue(PDF);
    expect(await saveAvatar({ objectKey: 'avatars/s1/x.jpg' })).toEqual({
      error: 'Підтримуються лише фото JPG і PNG',
    });
    expect(mockDelete).toHaveBeenCalledWith('avatars/s1/x.jpg');
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it('deletes and refuses an oversized object', async () => {
    mockHead.mockResolvedValue({ sizeBytes: 9 * 1024 * 1024, contentType: 'image/jpeg' });
    expect(await saveAvatar({ objectKey: 'avatars/s1/x.jpg' })).toHaveProperty('error');
    expect(mockDelete).toHaveBeenCalledWith('avatars/s1/x.jpg');
  });

  it('binds a real photo, audits the change and removes the previous photo', async () => {
    mockHead.mockResolvedValue({ sizeBytes: 800, contentType: 'image/jpeg' });
    mockBytes.mockResolvedValue(JPEG);
    staffFind.mockResolvedValue({
      lastName: 'Адмін',
      firstName: 'Адмін',
      patronymic: 'Адмінович',
      avatarKey: 'avatars/s1/old.jpg',
    });

    expect(await saveAvatar({ objectKey: 'avatars/s1/new.jpg' })).toEqual({ ok: true });

    expect(staffUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { avatarKey: 'avatars/s1/new.jpg' },
    });
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'UPDATE',
      entity: 'Staff',
      entityId: 's1',
      userId: 'u1',
    });
    // Only the OLD one is removed, never the photo that was just saved.
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('avatars/s1/old.jpg');
  });

  it('refuses a non-ADMIN even with a key in their own folder', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'EDITOR', staffId: 's2' } });
    expect(await saveAvatar({ objectKey: 'avatars/s2/x.jpg' })).toHaveProperty('error');
    expect(mockHead).not.toHaveBeenCalled();
    expect(staffUpdate).not.toHaveBeenCalled();
  });
});
