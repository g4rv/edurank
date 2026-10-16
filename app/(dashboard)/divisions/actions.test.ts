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
    division: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createDivision, deleteDivision, updateDivisionSettings } from './actions';

const mockAuth = auth as unknown as Mock;
const mockDivisionFind = db.division.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockRevalidate = revalidatePath as unknown as Mock;

function mockTx() {
  const tx = {
    division: {
      create: vi.fn().mockResolvedValue({ id: 'div-1' }),
      findUnique: vi.fn().mockResolvedValue({
        name: 'ННВ',
        canModerateRating: true,
        canOverseeScience: false,
        canViewQualifications: false,
        canInviteStaff: false,
        canSetPasswords: false,
        canEndSessions: false,
        entityPermissions: [],
        fieldPermissions: [],
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    divisionEntityPermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    divisionFieldPermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

function mockDivisionRowWith(
  tx: ReturnType<typeof mockTx>,
  extra: {
    entityPermissions?: { entity: string; action: string }[];
    fieldPermissions?: { fieldName: string }[];
  }
) {
  tx.division.findUnique.mockResolvedValue({
    name: 'ННВ',
    canModerateRating: true,
    canOverseeScience: false,
    canViewQualifications: false,
    canInviteStaff: false,
    canSetPasswords: false,
    canEndSessions: false,
    entityPermissions: [],
    fieldPermissions: [],
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Divisions control the permission system itself — EDITOR must NEVER manage them,
// no matter what entity permissions their division holds (privilege escalation).
describe('division actions authorization', () => {
  it('createDivision rejects EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    expect(
      await createDivision({
        name: 'Новий відділ',
        canModerateRating: false,
        canOverseeScience: false,
        canViewQualifications: false,
        canInviteStaff: false,
        canSetPasswords: false,
        canEndSessions: false,
      })
    ).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('deleteDivision rejects USER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'USER', staffId: 's1' } });
    expect(await deleteDivision('div-1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('createDivision allows ADMIN and audits', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    const tx = mockTx();
    expect(
      await createDivision({
        name: 'Новий відділ',
        canModerateRating: false,
        canOverseeScience: false,
        canViewQualifications: false,
        canInviteStaff: false,
        canSetPasswords: false,
        canEndSessions: false,
      })
    ).toEqual({
      redirectTo: '/divisions',
    });
    expect(tx.division.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('deleteDivision refuses when staff are still attached', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockDivisionFind.mockResolvedValue({ name: 'ННВ', _count: { staff: 4 } });
    expect(await deleteDivision('div-1')).toEqual({
      error: 'Неможливо видалити відділ, до якого прикріплені працівники',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('deleteDivision counts only non-archived staff', async () => {
    // Same rule as `deleteDepartment` — an archived person must not be the
    // reason a відділ cannot be deleted. The mock cannot apply Prisma's own
    // `where`, so this pins the query SHAPE instead — a regression guard
    // against the filter quietly being dropped again.
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
    mockDivisionFind.mockResolvedValue({ name: 'ННВ', _count: { staff: 0 } });
    const tx = mockTx();
    expect(await deleteDivision('div-1')).toEqual({ redirectTo: '/divisions' });
    expect(tx.division.delete).toHaveBeenCalled();
    expect(mockDivisionFind).toHaveBeenCalledWith({
      where: { id: 'div-1' },
      select: { name: true, _count: { select: { staff: { where: { archivedAt: null } } } } },
    });
  });
});

// «Перевірка науки» (D43) is a permission change — written and audited exactly
// like «Модерація рейтингу».
describe('«Перевірка науки» on a division', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
  });

  it('is written when a division is created', async () => {
    const tx = mockTx();
    await createDivision({
      name: 'Новий відділ',
      canModerateRating: false,
      canOverseeScience: true,
      canViewQualifications: false,
      canInviteStaff: false,
      canSetPasswords: false,
      canEndSessions: false,
    });
    expect(tx.division.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ canOverseeScience: true }) })
    );
  });
});

// The three account switches are permission changes too — written and audited
// exactly like the two above.
describe('account switches on a division', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
  });

  it('writes them when a division is created', async () => {
    const tx = mockTx();
    await createDivision({
      name: 'Новий відділ',
      canModerateRating: false,
      canOverseeScience: false,
      canViewQualifications: false,
      canInviteStaff: false,
      canSetPasswords: false,
      canEndSessions: true,
    });
    expect(tx.division.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ canEndSessions: true }) })
    );
  });
});

const full = {
  name: 'ННВ',
  canModerateRating: true,
  canOverseeScience: false,
  canViewQualifications: false,
  canInviteStaff: false,
  canSetPasswords: false,
  canEndSessions: false,
  entityPermissions: [] as string[],
  fieldPermissions: [] as string[],
};

describe('updateDivisionSettings', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: null } });
  });

  it('rejects EDITOR and USER, and touches nothing', async () => {
    for (const role of ['EDITOR', 'USER']) {
      mockAuth.mockResolvedValue({ user: { id: 'x', role, staffId: 's1' } });
      expect(await updateDivisionSettings('div-1', full)).toEqual({ error: 'Недостатньо прав' });
    }
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('writes the name and all five switches, and audits the change', async () => {
    const tx = mockTx();
    const result = await updateDivisionSettings('div-1', {
      ...full,
      canOverseeScience: true,
      canViewQualifications: false,
      canInviteStaff: true,
    });
    expect(result).toEqual({ redirectTo: '/divisions/div-1' });
    expect(tx.division.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'div-1' },
        data: expect.objectContaining({
          name: 'ННВ',
          canOverseeScience: true,
          canViewQualifications: false,
          canInviteStaff: true,
          canSetPasswords: false,
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const { changes } = tx.auditLog.create.mock.calls[0][0].data;
    expect(changes).toHaveProperty('canOverseeScience');
    expect(changes).toHaveProperty('canInviteStaff');
    expect(changes).not.toHaveProperty('canEndSessions');
  });

  it('replaces both permission sets exactly', async () => {
    const tx = mockTx();
    await updateDivisionSettings('div-1', {
      ...full,
      entityPermissions: ['STAFF:UPDATE', 'DEPARTMENT:CREATE'],
      fieldPermissions: ['phone', 'email'],
    });
    expect(tx.divisionEntityPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionEntityPermission.createMany).toHaveBeenCalledWith({
      data: [
        { divisionId: 'div-1', entity: 'STAFF', action: 'UPDATE' },
        { divisionId: 'div-1', entity: 'DEPARTMENT', action: 'CREATE' },
      ],
    });
    expect(tx.divisionFieldPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionFieldPermission.createMany).toHaveBeenCalledWith({
      data: [
        { divisionId: 'div-1', fieldName: 'phone' },
        { divisionId: 'div-1', fieldName: 'email' },
      ],
    });
  });

  // `deleteMany where NOT in []` would be a trap; clearing is delete-all + create-none.
  it('clears both sets when none are submitted', async () => {
    const tx = mockTx();
    mockDivisionRowWith(tx, {
      entityPermissions: [{ entity: 'STAFF', action: 'UPDATE' }],
      fieldPermissions: [{ fieldName: 'phone' }],
    });
    await updateDivisionSettings('div-1', full);
    expect(tx.divisionEntityPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionFieldPermission.deleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1' },
    });
    expect(tx.divisionEntityPermission.createMany).not.toHaveBeenCalled();
    expect(tx.divisionFieldPermission.createMany).not.toHaveBeenCalled();
    const { changes } = tx.auditLog.create.mock.calls[0][0].data;
    expect(changes).toHaveProperty('entityPermissions');
    expect(changes).toHaveProperty('fieldPermissions');
  });

  it.each(['employmentRate', 'divisionId', 'passwordHash', 'role', 'tokenVersion', 'notAField'])(
    'refuses %s anywhere in the list and writes nothing at all',
    async (name) => {
      const tx = mockTx();
      expect(
        await updateDivisionSettings('div-1', {
          ...full,
          canEndSessions: true,
          fieldPermissions: ['phone', name],
        })
      ).toEqual({ error: 'Невідоме поле' });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(tx.division.update).not.toHaveBeenCalled();
      expect(tx.divisionEntityPermission.deleteMany).not.toHaveBeenCalled();
      expect(tx.divisionEntityPermission.createMany).not.toHaveBeenCalled();
      expect(tx.divisionFieldPermission.deleteMany).not.toHaveBeenCalled();
      expect(tx.divisionFieldPermission.createMany).not.toHaveBeenCalled();
    }
  );

  it('refuses a malformed entity key', async () => {
    expect(
      await updateDivisionSettings('div-1', { ...full, entityPermissions: ['STAFF:EXPLODE'] })
    ).toEqual({
      error: 'Невірні дані',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    expect(await updateDivisionSettings('div-1', { ...full, name: '   ' })).toEqual({
      error: 'Невірні дані',
    });
  });

  it('answers «не знайдено» for a division that is gone', async () => {
    const tx = mockTx();
    tx.division.findUnique.mockResolvedValue(null);
    expect(await updateDivisionSettings('nope', full)).toEqual({ error: 'Відділ не знайдено' });
    expect(tx.division.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.divisionEntityPermission.deleteMany).not.toHaveBeenCalled();
    expect(tx.divisionFieldPermission.deleteMany).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('writes a duplicated entry once', async () => {
    const tx = mockTx();
    await updateDivisionSettings('div-1', {
      ...full,
      entityPermissions: ['STAFF:UPDATE', 'STAFF:UPDATE'],
      fieldPermissions: ['phone', 'phone'],
    });
    expect(tx.divisionEntityPermission.createMany).toHaveBeenCalledWith({
      data: [{ divisionId: 'div-1', entity: 'STAFF', action: 'UPDATE' }],
    });
    expect(tx.divisionFieldPermission.createMany).toHaveBeenCalledWith({
      data: [{ divisionId: 'div-1', fieldName: 'phone' }],
    });
  });

  it('writes nothing when a step inside the transaction fails', async () => {
    const tx = mockTx();
    tx.divisionFieldPermission.createMany.mockRejectedValue(new Error('db down'));
    const result = await updateDivisionSettings('div-1', { ...full, fieldPermissions: ['phone'] });
    expect(result).toEqual({ error: 'Не вдалося зберегти. Зміни не застосовано' });
    expect(result).not.toHaveProperty('redirectTo');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
