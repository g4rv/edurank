import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/get-active-template', () => ({ getActiveTemplate: vi.fn() }));
vi.mock('@/lib/rating/recompute', () => ({ recomputeRatingEntry: vi.fn() }));
vi.mock('@/lib/queries/get-science-plan-gate', () => ({
  getSciencePlanGate: vi.fn().mockResolvedValue({ open: true }),
}));
vi.mock('@/lib/queries/get-kharakterystyka', () => ({
  getKharakterystyka: vi.fn(),
  getKharakterystykaWithout: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn() },
    activity: { findUnique: vi.fn(), delete: vi.fn() },
    kharakterystykaEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    kharakterystykaRemovedLine: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getKharakterystyka, getKharakterystykaWithout } from '@/lib/queries/get-kharakterystyka';
import { recomputeRatingEntry } from '@/lib/rating/recompute';
import { getSciencePlanGate } from '@/lib/queries/get-science-plan-gate';
import {
  addKharakterystykaEntry,
  deleteKharakterystykaEntry,
  previewLineRemoval,
  removeKharakterystykaLine,
} from './actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveTemplate as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;
const mockEntryFind = db.kharakterystykaEntry.findUnique as unknown as Mock;
const mockCreate = db.kharakterystykaEntry.create as unknown as Mock;
const mockDelete = db.kharakterystykaEntry.delete as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockActivityFind = db.activity.findUnique as unknown as Mock;
const mockActivityDelete = db.activity.delete as unknown as Mock;
const mockUpdate = db.kharakterystykaEntry.update as unknown as Mock;
const mockRemovedLine = db.kharakterystykaRemovedLine.createMany as unknown as Mock;

const STAFF_ID = 'staff-1';

// Every position has its own form now, so a payload is only valid against the
// position it names — see `lib/kharakterystyka/position-evidence.ts`.
const P15 = {
  option: 'olympiad_jury',
  stage: 'stage_3',
  event: 'Біологія',
  // Every field of п.15 is obligatory (owner, 2026-09-14), the ПІБ in three
  // boxes that print as one name. Ukrainian letters only — «Kovalenko» and
  // «фів» are both refused.
  pupilLast: 'Коваленко',
  pupilFirst: 'Марія',
  pupilMiddle: 'Ігорівна',
  place: 'second',
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
      kharakterystykaEntry: { create: mockCreate, delete: mockDelete, update: mockUpdate },
      kharakterystykaRemovedLine: { createMany: mockRemovedLine },
      activity: { delete: mockActivityDelete },
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

  // A typed row is the one part of this document somebody can write. Who may
  // write it has widened twice: ADMIN-only until 2026-09-14, then п.15/п.20 on
  // your OWN document, and since 2026-09-22 **every position that has a form**
  // — all but the military three. What these cases pin is the boundary that is
  // left: your own record, and not п.16–п.18.
  it.each(['EDITOR', 'USER'])('refuses %s writing on somebody else', async (role) => {
    mockAuth.mockResolvedValue({ user: { id: 'x', role, staffId: 'x' } });
    const result = await addKharakterystykaEntry(valid);
    expect(result).toEqual({ error: expect.stringContaining('власної') });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('lets an НПП type п.15 on their own document', async () => {
    mockAuth.mockResolvedValue({ user: { id: STAFF_ID, role: 'USER', staffId: STAFF_ID } });
    expect(await addKharakterystykaEntry(valid)).toEqual({ success: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 15, source: 'MANUAL', createdBy: STAFF_ID }),
      })
    );
  });

  it('lets an НПП type a derived position on their own document', async () => {
    // п.2 is fed by indicators, and this is exactly what widened on 2026-09-22:
    // the import left positions empty that people genuinely satisfy, and its
    // subject is the only one who can repair that. The row prints «Внесено
    // власноруч» and is audited — see §H of docs/work-remaining.md.
    mockAuth.mockResolvedValue({ user: { id: STAFF_ID, role: 'USER', staffId: STAFF_ID } });
    expect(await addKharakterystykaEntry(validP2)).toEqual({ success: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 2, source: 'MANUAL', createdBy: STAFF_ID }),
      })
    );
  });

  it('still lets an ADMIN type a derived position', async () => {
    asAdmin();
    expect(await addKharakterystykaEntry(validP2)).toEqual({ success: true });
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
    createdBy: 'admin-1',
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
    expect(result).toEqual({ error: expect.stringContaining('рядка характеристики') });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('refuses somebody else’s row', async () => {
    mockEntryFind.mockResolvedValue(manual);
    mockAuth.mockResolvedValue({ user: { id: 'x', role: 'EDITOR', staffId: 'x' } });
    const result = await deleteKharakterystykaEntry('entry-1');
    expect(result).toEqual({ error: expect.stringContaining('власної') });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('lets an НПП remove a row they typed themselves', async () => {
    mockEntryFind.mockResolvedValue({ ...manual, createdBy: STAFF_ID });
    mockAuth.mockResolvedValue({ user: { id: STAFF_ID, role: 'USER', staffId: STAFF_ID } });
    expect(await deleteKharakterystykaEntry('entry-1')).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
  });

  // Any line of their own document, whoever typed it (owner, 2026-10-06)
  it('lets an НПП remove a row an administrator typed for them', async () => {
    mockEntryFind.mockResolvedValue(manual); // createdBy: 'admin-1'
    mockAuth.mockResolvedValue({ user: { id: STAFF_ID, role: 'USER', staffId: STAFF_ID } });
    expect(await deleteKharakterystykaEntry('entry-1')).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
  });
});

// Any line of the document, whatever its source (owner, 2026-10-06) — and final.
describe('removeKharakterystykaLine', () => {
  const asNpp = () =>
    mockAuth.mockResolvedValue({ user: { id: STAFF_ID, role: 'USER', staffId: STAFF_ID } });
  const activityIn = (status: 'OPEN' | 'CLOSED', submittedByRole = 'NPP') => ({
    staffId: STAFF_ID,
    year: status === 'OPEN' ? 2026 : 2025,
    score: 40,
    status: 'APPROVED',
    evidence: { title: 'Стаття' },
    submittedByRole,
    activityType: {
      label: 'Публікація',
      licencePositions: [{ position: 1 }],
      evidenceFields: [],
      template: { status },
    },
  });
  const ratingLine = { kind: 'activity', activityId: 'act-1', position: 1 };
  const entry = {
    staffId: STAFF_ID,
    position: 1,
    group: null,
    year: 2023,
    text: 'Стаття 2023',
    source: 'IMPORT',
    removedAt: null,
  };

  // A closed year is frozen: the line leaves the Характеристика only.
  it('hides a closed year’s rating line and leaves the rating alone', async () => {
    asNpp();
    mockActivityFind.mockResolvedValue(activityIn('CLOSED'));
    expect(await removeKharakterystykaLine(STAFF_ID, ratingLine)).toEqual({ success: true });
    expect(mockRemovedLine).toHaveBeenCalledWith({
      data: [{ activityId: 'act-1', position: 1, removedBy: STAFF_ID }],
      skipDuplicates: true,
    });
    expect(mockActivityDelete).not.toHaveBeenCalled();
    expect(recomputeRatingEntry).not.toHaveBeenCalled();
  });

  // An open year's line is wrong in the rating too, and it can still be fixed.
  it('deletes an open year’s entry from the rating, the НПП’s own', async () => {
    asNpp();
    mockActivityFind.mockResolvedValue(activityIn('OPEN'));
    expect(await removeKharakterystykaLine(STAFF_ID, ratingLine)).toEqual({ success: true });
    expect(mockActivityDelete).toHaveBeenCalledWith({ where: { id: 'act-1' } });
    expect(recomputeRatingEntry).toHaveBeenCalledWith(expect.anything(), STAFF_ID, 2026);
    expect(mockRemovedLine).not.toHaveBeenCalled();
  });

  it('asks an НПП for a saved science plan first, as any rating change does', async () => {
    asNpp();
    mockActivityFind.mockResolvedValue(activityIn('OPEN'));
    (getSciencePlanGate as Mock).mockResolvedValueOnce({ open: false });
    const result = await removeKharakterystykaLine(STAFF_ID, ratingLine);
    expect(result).toHaveProperty('error');
    expect(mockActivityDelete).not.toHaveBeenCalled();
  });

  it('refuses an НПП a відділ’s open-year entry', async () => {
    asNpp();
    mockActivityFind.mockResolvedValue(activityIn('OPEN', 'DIVISION'));
    const result = await removeKharakterystykaLine(STAFF_ID, ratingLine);
    expect(result).toEqual({ error: expect.stringContaining('відділом') });
    expect(mockActivityDelete).not.toHaveBeenCalled();
  });

  it('lets ADMIN delete a відділ’s open-year entry from the rating', async () => {
    mockActivityFind.mockResolvedValue(activityIn('OPEN', 'DIVISION'));
    expect(await removeKharakterystykaLine(STAFF_ID, ratingLine)).toEqual({ success: true });
    expect(mockActivityDelete).toHaveBeenCalledWith({ where: { id: 'act-1' } });
  });

  it('refuses a position the activity does not feed', async () => {
    mockActivityFind.mockResolvedValue(activityIn('CLOSED'));
    const result = await removeKharakterystykaLine(STAFF_ID, { ...ratingLine, position: 3 });
    expect(result).toEqual({ error: 'Запис не знайдено' });
    expect(mockRemovedLine).not.toHaveBeenCalled();
  });

  it('refuses somebody else’s activity', async () => {
    mockActivityFind.mockResolvedValue({ ...activityIn('CLOSED'), staffId: 'someone-else' });
    expect(await removeKharakterystykaLine(STAFF_ID, ratingLine)).toEqual({
      error: 'Запис не знайдено',
    });
  });

  // Deleted, an imported line would come back with the next import run.
  it('hides an imported line rather than deleting it', async () => {
    mockEntryFind.mockResolvedValue(entry);
    expect(
      await removeKharakterystykaLine(STAFF_ID, { kind: 'entry', entryId: 'entry-9' })
    ).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'entry-9' },
      data: { removedAt: expect.any(Date), removedBy: 'admin-1' },
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes a typed line outright', async () => {
    mockEntryFind.mockResolvedValue({ ...entry, source: 'MANUAL' });
    await removeKharakterystykaLine(STAFF_ID, { kind: 'entry', entryId: 'entry-9' });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'entry-9' } });
  });

  it('refuses an НПП on somebody else’s document', async () => {
    asNpp();
    const result = await removeKharakterystykaLine('other-staff', ratingLine);
    expect(result).toEqual({ error: expect.stringContaining('власної') });
    expect(mockActivityFind).not.toHaveBeenCalled();
  });
});

describe('previewLineRemoval', () => {
  const doc = (met: boolean, metCount: number) => ({
    from: 2022,
    to: 2026,
    metCount,
    qualifies: metCount >= 4,
    positions: [
      { number: 1, title: 'Публікації', met, progress: met ? null : { have: 4, need: 5 } },
    ],
  });

  it('says what the position and the count become', async () => {
    mockActivityFind.mockResolvedValue({
      staffId: STAFF_ID,
      status: 'APPROVED',
      score: 40,
      submittedByRole: 'NPP',
      activityType: { licencePositions: [{ position: 1 }], template: { status: 'CLOSED' } },
    });
    (getKharakterystyka as Mock).mockResolvedValue(doc(true, 4));
    (getKharakterystykaWithout as Mock).mockResolvedValue(doc(false, 3));
    expect(
      await previewLineRemoval(STAFF_ID, { kind: 'activity', activityId: 'act-1', position: 1 })
    ).toEqual({
      mode: 'hide',
      score: null,
      position: 1,
      title: 'Публікації',
      metBefore: true,
      metAfter: false,
      progressAfter: { have: 4, need: 5 },
      metCountBefore: 4,
      metCountAfter: 3,
      total: 1,
      qualifiesBefore: true,
      qualifiesAfter: false,
    });
  });
});
