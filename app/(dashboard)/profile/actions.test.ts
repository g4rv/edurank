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

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { OwnProfileSchema } from '@/validations/staff';
import { updateOwnProfile } from './actions';

const mockAuth = auth as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const payload: OwnProfileSchema = {
  phone: '+380501112233',
  wosUrl: 'https://www.webofscience.com/wos/author/record/1',
  scopusUrl: null,
  googleScholarUrl: null,
  orcidId: '0000-0001-2345-6789',
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
