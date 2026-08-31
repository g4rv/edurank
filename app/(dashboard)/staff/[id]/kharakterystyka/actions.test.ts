import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/get-active-template', () => ({ getActiveTemplate: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn() },
    kharakterystykaEntry: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { addKharakterystykaEntry, deleteKharakterystykaEntry } from './actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveTemplate as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;
const mockEntryFind = db.kharakterystykaEntry.findUnique as unknown as Mock;
const mockCreate = db.kharakterystykaEntry.create as unknown as Mock;
const mockDelete = db.kharakterystykaEntry.delete as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const STAFF_ID = 'staff-1';
const valid = {
  staffId: STAFF_ID,
  position: 15,
  year: 2024,
  text: 'Член журі ІІІ етапу Всеукраїнської олімпіади',
  count: 1,
};

function asAdmin() {
  mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', staffId: 'admin-1' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  asAdmin();
  mockTemplate.mockResolvedValue({ year: 2026 });
  mockStaff.mockResolvedValue({
    isNpp: true,
    lastName: 'Петренко',
    firstName: 'Іван',
    patronymic: 'Петрович',
  });
  mockCreate.mockResolvedValue({ id: 'entry-1' });
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      kharakterystykaEntry: { create: mockCreate, delete: mockDelete },
      auditLog: { create: db.auditLog.create },
    })
  );
});

describe('addKharakterystykaEntry', () => {
  it('stores the row for an admin', async () => {
    const result = await addKharakterystykaEntry(valid);
    expect(result).toEqual({ success: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 15, year: 2024, source: 'MANUAL' }),
      })
    );
  });

  // The rest of the document is derived and nobody can edit it. A typed row is
  // the one exception, so it is held to the narrowest audience: somebody who
  // could type their own п.15 could type п.1, which is a licence claim about
  // publications that either exist or do not.
  it.each(['EDITOR', 'USER'])('refuses %s', async (role) => {
    mockAuth.mockResolvedValue({ user: { id: 'x', role, staffId: 'x' } });
    const result = await addKharakterystykaEntry(valid);
    expect(result).toEqual({ error: expect.stringContaining('адміністратор') });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sends an anonymous caller to the login page', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(addKharakterystykaEntry(valid)).rejects.toThrow('redirected');
  });

  // «Для вищих військових навчальних закладів» — this university may not claim
  // them at all, so the server refuses rather than storing something invisible.
  it.each([16, 17, 18])('refuses the military position п.%i', async (position) => {
    const result = await addKharakterystykaEntry({ ...valid, position });
    expect(result).toEqual({ error: expect.stringContaining('не застосовується') });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // A row outside the window is stored and never appears, which reads exactly
  // like a save that did not work.
  it.each([2021, 2027])('refuses the year %i, outside 2022–2026', async (year) => {
    const result = await addKharakterystykaEntry({ ...valid, year });
    expect(result).toEqual({ error: expect.stringContaining('2022–2026') });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts both edges of the window', async () => {
    for (const year of [2022, 2026]) {
      expect(await addKharakterystykaEntry({ ...valid, year })).toEqual({ success: true });
    }
  });

  it('refuses a non-НПП, who has no Характеристика at all', async () => {
    mockStaff.mockResolvedValue({ isNpp: false, lastName: 'П', firstName: 'І', patronymic: 'П' });
    const result = await addKharakterystykaEntry(valid);
    expect(result).toEqual({ error: expect.stringContaining('НПП') });
  });

  it('refuses empty evidence and an out-of-range count', async () => {
    expect(await addKharakterystykaEntry({ ...valid, text: '' })).toMatchObject({
      error: expect.any(String),
    });
    expect(await addKharakterystykaEntry({ ...valid, count: 9 })).toMatchObject({
      error: expect.any(String),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('deleteKharakterystykaEntry', () => {
  const manual = {
    staffId: STAFF_ID,
    position: 15,
    year: 2024,
    text: 'x',
    count: 1,
    source: 'MANUAL',
    staff: { lastName: 'Петренко', firstName: 'Іван', patronymic: 'Петрович' },
  };

  it('removes a typed row', async () => {
    mockEntryFind.mockResolvedValue(manual);
    expect(await deleteKharakterystykaEntry('entry-1')).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
  });

  // An imported row is replaced wholesale on the next import run, so deleting
  // one here would come back and look like the delete had failed.
  it('refuses an imported row', async () => {
    mockEntryFind.mockResolvedValue({ ...manual, source: 'IMPORT' });
    const result = await deleteKharakterystykaEntry('entry-1');
    expect(result).toEqual({ error: expect.stringContaining('імпорт') });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('refuses a non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'x', role: 'EDITOR', staffId: 'x' } });
    const result = await deleteKharakterystykaEntry('entry-1');
    expect(result).toEqual({ error: expect.stringContaining('адміністратор') });
  });
});
