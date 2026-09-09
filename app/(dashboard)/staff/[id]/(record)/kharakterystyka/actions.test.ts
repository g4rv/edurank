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

// Every position has its own form now, so a payload is only valid against the
// position it names — see `lib/kharakterystyka/position-evidence.ts`.
const P15 = {
  option: 'olympiad_jury',
  stage: 'stage_3',
  event: 'Біологія',
  pupil: '',
  place: '',
};
const P2 = { registrationNumber: '12345', title: 'Пристрій', date: '' };

const valid = {
  staffId: STAFF_ID,
  position: 15,
  year: 2024,
  group: null,
  evidence: P15,
};
/** The same row against п.2, whose fields and alternatives both differ */
const validP2 = { ...valid, position: 2, evidence: P2 };

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

  it('refuses evidence missing a field the position requires', async () => {
    const noStage = { ...P15, stage: '' };
    expect(await addKharakterystykaEntry({ ...valid, evidence: noStage })).toMatchObject({
      error: expect.any(String),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // The form is per position, so п.2's answers mean nothing under п.15 — and a
  // row saved from the wrong set would print a sentence built from no fields.
  it('refuses evidence belonging to another position', async () => {
    expect(await addKharakterystykaEntry({ ...valid, evidence: P2 })).toMatchObject({
      error: expect.any(String),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // What prints is generated from the answers, never typed — so every row of
  // one position reads the same way in the document.
  it('generates the printed text from the fields', async () => {
    expect(await addKharakterystykaEntry(valid)).toEqual({ success: true });
    const written = mockCreate.mock.calls[0][0].data;
    expect(written.text).toContain('журі');
    expect(written.text).toContain('III етап');
    expect(written.text).toContain('Біологія');
    // Unanswered optional fields simply do not appear
    expect(written.text).not.toContain('undefined');
    expect(written.evidence).toMatchObject({ option: 'olympiad_jury', event: 'Біологія' });
  });

  // A group belonging to another position — or to none — lands the row in a
  // bucket nothing reads: it would save, and the status beside it would not move.
  it('refuses a group that is not this position’s', async () => {
    const result = await addKharakterystykaEntry({ ...validP2, group: 'nonsense' });
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // п.2 is the only position with a choice, and all three of its bars are real:
  // one патент на винахід, five деклараційних, five свідоцтв.
  it('accepts each alternative of п.2', async () => {
    for (const group of ['patent', 'declarative', 'copyright']) {
      expect(await addKharakterystykaEntry({ ...validP2, group })).toEqual({ success: true });
    }
  });

  // Nineteen positions have one way of being met, so the form asks nothing and
  // the row lands on that alternative by itself.
  it('accepts no group where there is nothing to choose', async () => {
    expect(await addKharakterystykaEntry({ ...valid, group: null })).toEqual({ success: true });
  });
});

describe('deleteKharakterystykaEntry', () => {
  const manual = {
    staffId: STAFF_ID,
    position: 15,
    group: null,
    year: 2024,
    text: 'x',
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
