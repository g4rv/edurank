import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    staff: { findUnique: vi.fn() },
    scienceRecord: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeScienceRecord, restoreScienceRecord } from './science-actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockRecordFind = db.scienceRecord.findUnique as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: null } };
const nnvEditorSession = { user: { id: 'editor-1', role: 'EDITOR', staffId: 'staff-nnv' } };
const otherEditorSession = { user: { id: 'editor-2', role: 'EDITOR', staffId: 'staff-other' } };

/** APPROVED, in an OPEN template — the ordinary discardable case. */
const APPROVED_RECORD = {
  id: 'r1',
  status: 'APPROVED',
  staff: { lastName: 'Петренко', firstName: 'Петро', patronymic: 'Петрович' },
  work: { workType: { label: 'Наукова стаття' } },
  template: { status: 'OPEN' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(adminSession);
  // `canOverseeScience` reads the caller's division switch through
  // `db.staff.findUnique` — mocked here so an EDITOR session exercises the
  // REAL guard, the way `moderation/actions.test.ts` drives `canModerateRating`.
  mockStaffFind.mockResolvedValue({ division: { canOverseeScience: true } });
  mockRecordFind.mockResolvedValue(APPROVED_RECORD);
});

describe('removeScienceRecord', () => {
  it('refuses an editor without «Перевірка науки»', async () => {
    mockAuth.mockResolvedValue(otherEditorSession);
    mockStaffFind.mockResolvedValue({ division: { canOverseeScience: false } });
    expect(await removeScienceRecord('r1', 'Немає підтвердження')).toEqual({
      error: 'Недостатньо прав',
    });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('allows an editor whose division has «Перевірка науки»', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    expect(await removeScienceRecord('r1', 'Немає підтвердження')).toEqual({ ok: true });
    expect(db.scienceRecord.update).toHaveBeenCalled();
  });

  it('demands a reason', async () => {
    expect(await removeScienceRecord('r1', '   ')).toEqual({ error: 'Вкажіть причину відхилення' });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('refuses a reason over 500 characters', async () => {
    expect(await removeScienceRecord('r1', 'а'.repeat(501))).toEqual({
      error: 'Причина занадто довга (до 500 символів)',
    });
  });

  it('refuses a record that does not exist', async () => {
    mockRecordFind.mockResolvedValue(null);
    expect(await removeScienceRecord('r1', 'причина')).toEqual({ error: 'Запис не знайдено' });
  });

  it('refuses a record that is already REMOVED', async () => {
    mockRecordFind.mockResolvedValue({ ...APPROVED_RECORD, status: 'REMOVED' });
    expect(await removeScienceRecord('r1', 'причина')).toEqual({
      error: 'Цей запис не можна відхилити',
    });
  });

  it('refuses a record whose template is CLOSED — the same rule removeActivity enforces for the rating', async () => {
    mockRecordFind.mockResolvedValue({ ...APPROVED_RECORD, template: { status: 'CLOSED' } });
    expect(await removeScienceRecord('r1', 'причина')).toEqual({
      error: 'Планування на цей рік закрито',
    });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('sets REMOVED and keeps the row — the person has to be able to read why', async () => {
    await removeScienceRecord('r1', 'Посилання веде на іншу статтю');
    const data = (db.scienceRecord.update as Mock).mock.calls[0][0].data;
    expect(data.status).toBe('REMOVED');
    expect(data.removedReason).toBe('Посилання веде на іншу статтю');
    expect(db.scienceRecord.delete).not.toHaveBeenCalled();
  });

  it('writes an audit entry naming who and what', async () => {
    await removeScienceRecord('r1', 'причина');
    expect(db.auditLog.create).toHaveBeenCalled();
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.entity).toBe('ScienceRecord');
    expect(entry.action).toBe('UPDATE');
    expect(entry.label).toContain('Наукова стаття');
  });

  it('never writes hoursHundredths — the pool read is what filters on APPROVED', async () => {
    // `getSciencePlan` already excludes a REMOVED record from виконано
    // (lib/queries/get-science-plan.test.ts, "EXCLUDES a declined draw from
    // виконано but still returns it"), and every other sum over
    // `hoursHundredths` carries the same `status: 'APPROVED'` filter (see the
    // grep in this task's own report). This action's only job is the status
    // flip — touching the hours figure itself would be a second, unnecessary
    // way for the two to disagree.
    await removeScienceRecord('r1', 'причина');
    const data = (db.scienceRecord.update as Mock).mock.calls[0][0].data;
    expect(data.hoursHundredths).toBeUndefined();
  });
});

describe('restoreScienceRecord', () => {
  it('refuses an editor without «Перевірка науки»', async () => {
    mockAuth.mockResolvedValue(otherEditorSession);
    mockStaffFind.mockResolvedValue({ division: { canOverseeScience: false } });
    expect(await restoreScienceRecord('r1')).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses a record that is not REMOVED', async () => {
    expect(await restoreScienceRecord('r1')).toEqual({ error: 'Цей запис не відхилено' });
  });

  it('refuses a record that does not exist', async () => {
    mockRecordFind.mockResolvedValue(null);
    expect(await restoreScienceRecord('r1')).toEqual({ error: 'Запис не знайдено' });
  });

  it('restores a record, clearing the reason', async () => {
    mockRecordFind.mockResolvedValue({ ...APPROVED_RECORD, status: 'REMOVED' });
    await restoreScienceRecord('r1');
    const data = (db.scienceRecord.update as Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'APPROVED', removedReason: null, removedAt: null });
  });

  it('refuses to restore into a CLOSED template — a restore is a write too', async () => {
    mockRecordFind.mockResolvedValue({
      ...APPROVED_RECORD,
      status: 'REMOVED',
      template: { status: 'CLOSED' },
    });
    expect(await restoreScienceRecord('r1')).toEqual({ error: 'Планування на цей рік закрито' });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('writes an audit entry', async () => {
    mockRecordFind.mockResolvedValue({ ...APPROVED_RECORD, status: 'REMOVED' });
    await restoreScienceRecord('r1');
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});
