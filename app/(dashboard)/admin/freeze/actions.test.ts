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
    staff: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { addFreezeExemption, removeFreezeExemption, updateFreezeSettings } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const OFF = {
  allFrozen: false,
  kharakterystykaFrozen: false,
  linkedRatingFrozen: false,
  profileFrozen: false,
};

function mockTx() {
  const tx = {
    freezeSettings: {
      findUnique: vi.fn().mockResolvedValue(OFF),
      upsert: vi.fn().mockResolvedValue({}),
    },
    freezeExemption: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

const asAdmin = () => mockAuth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } });

describe('updateFreezeSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses anybody but ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e', role: 'EDITOR' } });
    expect(await updateFreezeSettings({ ...OFF, allFrozen: true })).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('writes the four switches to the one row and audits the change', async () => {
    asAdmin();
    const tx = mockTx();
    const next = { ...OFF, allFrozen: true, profileFrozen: true };
    expect(await updateFreezeSettings(next)).toEqual({ success: true });

    expect(tx.freezeSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'default' },
        update: { ...next, updatedById: 'admin' },
      })
    );
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      entity: 'FreezeSettings',
      entityId: 'default',
      action: 'UPDATE',
    });
    expect(audit.changes).toEqual({
      allFrozen: { from: false, to: true },
      profileFrozen: { from: false, to: true },
    });
  });

  it('refuses a payload that is not four booleans', async () => {
    asAdmin();
    expect(await updateFreezeSettings({ allFrozen: 'yes' } as never)).toEqual({
      error: 'Невірні дані',
    });
  });
});

describe('the whitelist', () => {
  beforeEach(() => vi.clearAllMocks());

  const person = {
    lastName: 'Єрічева',
    firstName: 'Тамара',
    patronymic: 'Юріївна',
    role: 'USER',
    archivedAt: null,
  };

  it('adds a person, audited under their name', async () => {
    asAdmin();
    mockStaffFind.mockResolvedValue(person);
    const tx = mockTx();
    expect(await addFreezeExemption({ staffId: 's1' })).toEqual({ success: true });
    expect(tx.freezeExemption.create).toHaveBeenCalledWith({
      data: { staffId: 's1', createdById: 'admin' },
    });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      entity: 'FreezeExemption',
      entityId: 's1',
      action: 'CREATE',
      label: 'Єрічева Тамара Юріївна',
    });
  });

  it('does nothing for somebody already listed', async () => {
    asAdmin();
    mockStaffFind.mockResolvedValue(person);
    const tx = mockTx();
    tx.freezeExemption.findUnique.mockResolvedValue({ staffId: 's1' });
    expect(await addFreezeExemption({ staffId: 's1' })).toEqual({ success: true });
    expect(tx.freezeExemption.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // ADMIN is never frozen; listing one would only mislead the next reader.
  it('refuses an ADMIN and an archived person', async () => {
    asAdmin();
    mockStaffFind.mockResolvedValue({ ...person, role: 'ADMIN' });
    expect(await addFreezeExemption({ staffId: 's1' })).toMatchObject({
      error: expect.any(String),
    });
    mockStaffFind.mockResolvedValue({ ...person, archivedAt: new Date() });
    expect(await addFreezeExemption({ staffId: 's1' })).toEqual({ error: 'Запис архівовано' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('removes a person, audited', async () => {
    asAdmin();
    const tx = mockTx();
    tx.freezeExemption.findUnique.mockResolvedValue({ staff: person });
    expect(await removeFreezeExemption({ staffId: 's1' })).toEqual({ success: true });
    expect(tx.freezeExemption.delete).toHaveBeenCalledWith({ where: { staffId: 's1' } });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      entity: 'FreezeExemption',
      action: 'DELETE',
      label: 'Єрічева Тамара Юріївна',
    });
  });

  it('refuses anybody but ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'USER' } });
    expect(await addFreezeExemption({ staffId: 's1' })).toEqual({ error: 'Недостатньо прав' });
    expect(await removeFreezeExemption({ staffId: 's1' })).toEqual({ error: 'Недостатньо прав' });
  });
});
