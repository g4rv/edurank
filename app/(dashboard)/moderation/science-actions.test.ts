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
    scienceRecord: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    scienceWork: { update: vi.fn() },
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
  workId: 'w1',
  staff: { lastName: 'Петренко', firstName: 'Петро', patronymic: 'Петрович' },
  work: { declinedAt: null as Date | null, workType: { label: 'Наукова стаття' } },
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
    expect(db.scienceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('allows an editor whose division has «Перевірка науки»', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    expect(await removeScienceRecord('r1', 'Немає підтвердження')).toEqual({ ok: true });
    expect(db.scienceRecord.updateMany).toHaveBeenCalled();
  });

  it('demands a reason', async () => {
    expect(await removeScienceRecord('r1', '   ')).toEqual({ error: 'Вкажіть причину відхилення' });
    expect(db.scienceRecord.updateMany).not.toHaveBeenCalled();
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
    expect(db.scienceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a work that is already declined', async () => {
    mockRecordFind.mockResolvedValue({
      ...APPROVED_RECORD,
      work: { ...APPROVED_RECORD.work, declinedAt: new Date() },
    });
    expect(await removeScienceRecord('r1', 'причина')).toEqual({
      error: 'Цей запис не можна відхилити',
    });
  });

  it('declines the WHOLE WORK — every record on it, not only the one ННВ opened', async () => {
    await removeScienceRecord('r1', 'Посилання веде на іншу статтю');
    const many = (db.scienceRecord.updateMany as Mock).mock.calls[0][0];
    // every APPROVED record of the work, by work id — never by the one record id
    expect(many.where).toEqual({ workId: 'w1', status: 'APPROVED' });
    expect(many.data.status).toBe('REMOVED');
    expect(many.data.removedReason).toBe('Посилання веде на іншу статтю');
    expect(db.scienceRecord.delete).not.toHaveBeenCalled();
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('stamps the work and every record with the SAME moment — how a resubmit finds them again', async () => {
    await removeScienceRecord('r1', 'причина');
    const work = (db.scienceWork.update as Mock).mock.calls[0][0];
    const many = (db.scienceRecord.updateMany as Mock).mock.calls[0][0];
    expect(work.where).toEqual({ id: 'w1' });
    expect(work.data.declineReason).toBe('причина');
    expect(work.data.declinedById).toBe('admin-1');
    expect(work.data.declinedAt).toBeInstanceOf(Date);
    expect(many.data.removedAt).toBe(work.data.declinedAt);
  });

  it('writes an audit entry naming who and what', async () => {
    await removeScienceRecord('r1', 'причина');
    expect(db.auditLog.create).toHaveBeenCalled();
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.entity).toBe('ScienceWork');
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
    const data = (db.scienceRecord.updateMany as Mock).mock.calls[0][0].data;
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

  it('undoes a decline of the WHOLE WORK — every record it switched off, and only those', async () => {
    const declinedAt = new Date('2026-09-30T10:00:00Z');
    mockRecordFind.mockResolvedValue({
      ...APPROVED_RECORD,
      status: 'REMOVED',
      work: { ...APPROVED_RECORD.work, declinedAt },
    });
    expect(await restoreScienceRecord('r1')).toEqual({ ok: true });
    const many = (db.scienceRecord.updateMany as Mock).mock.calls[0][0];
    expect(many.where).toEqual({ workId: 'w1', status: 'REMOVED', removedAt: declinedAt });
    expect(many.data).toMatchObject({ status: 'APPROVED', removedReason: null });
    const work = (db.scienceWork.update as Mock).mock.calls[0][0];
    expect(work.data).toMatchObject({ declinedAt: null, declineReason: null, resubmittedAt: null });
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
