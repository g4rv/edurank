import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    staff: { findUnique: vi.fn() },
    scienceWorkType: { findFirst: vi.fn(), findUnique: vi.fn() },
    scienceWork: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    scienceRecord: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    sciencePlan: { findUnique: vi.fn(), create: vi.fn() },
    sciencePlanRow: { findUnique: vi.fn() },
    stakeAllocation: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));

import { Prisma } from '@/lib/generated/prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { deleteRecord, joinWork, saveRecord, updateWorkEvidence } from './record-actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveScienceTemplate as unknown as Mock;

/**
 * A REAL PrismaClientKnownRequestError. `isUniqueViolation` tests with
 * `instanceof`, so a plain object carrying code P2002 falls through to the
 * generic message and a test built on one would pass against a broken guard —
 * the trap `admin/students/actions.test.ts` already documents.
 */
const unique = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

/**
 * The article type: SELECT_MULT, 50 г per page for Scopus, so ten pages is
 * 500 год — the whole yearly norm on one ставка. Field names are dictated by
 * the scoring engine (`option`, `credits`), not chosen here.
 */
const ARTICLE = {
  id: 'wt1',
  templateId: 't1',
  code: 'article',
  label: 'Наукова стаття',
  isActive: true,
  coefficient: 1,
  maxPerYear: null as number | null,
  requiresFile: false,
  reuse: 'ONCE' as const,
  sharing: 'SHARED' as const,
  identityFields: ['doi', 'url', 'title'],
  scoring: { kind: 'SELECT_MULT' },
  evidenceFields: [
    { kind: 'text', name: 'title', label: 'Назва' },
    { kind: 'doi', name: 'doi', label: 'DOI', optional: true },
    {
      kind: 'select',
      name: 'option',
      label: 'Видання',
      options: [
        { value: 'scopus', label: 'Scopus / WoS', points: 50 },
        { value: 'fahove_b', label: 'Фахове «Б»', points: 30 },
      ],
    },
    { kind: 'number', name: 'credits', label: 'Сторінок', min: 1 },
  ],
};

const TEMPLATE = { id: 't1', academicYear: '2026/2027', status: 'OPEN', stakeYear: 2026 };

const STAFF = {
  lastName: 'Петренко',
  firstName: 'Петро',
  patronymic: 'Петрович',
  isNpp: true,
  departmentId: 'd1',
  partTimeDepartments: [] as { departmentId: string }[],
};

/** Submitted, and carrying the пункт under test. A fact can only be recorded
 *  against a planned пункт on a locked plan (owner, 2026-09-17). */
const LOCKED_PLAN = {
  id: 'plan-1',
  lockedAt: new Date('2026-09-18'),
  rows: [{ id: 'pr-existing' }],
};

const base = {
  departmentId: 'd1',
  workTypeId: 'wt1',
  evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 10 },
  link: 'https://doi.org/10.31392/xyz',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u1', staffId: 'staff-1', role: 'USER' } });
  mockTemplate.mockResolvedValue(TEMPLATE);
  (db.staff.findUnique as Mock).mockResolvedValue(STAFF);
  (db.scienceWorkType.findFirst as Mock).mockResolvedValue(ARTICLE);
  (db.scienceWork.findUnique as Mock).mockResolvedValue(null);
  (db.sciencePlan.findUnique as Mock).mockResolvedValue(LOCKED_PLAN);
  (db.scienceRecord.count as Mock).mockResolvedValue(0);
  (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 100 });
  (db.scienceWork.create as Mock).mockResolvedValue({ id: 'w1' });
  (db.scienceRecord.create as Mock).mockResolvedValue({ id: 'r1' });
  (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 0 } });
  (db.$transaction as Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(db));
});

describe('saveRecord — the guards', () => {
  it('refuses an anonymous caller', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await saveRecord(base)).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses a non-НПП', async () => {
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: false });
    expect(await saveRecord(base)).toEqual({
      error: 'Облік наукової роботи доступний лише для НПП',
    });
  });

  it('refuses a кафедра the person does not work on', async () => {
    expect(await saveRecord({ ...base, departmentId: 'other' })).toEqual({
      error: 'Ви не працюєте на цій кафедрі',
    });
  });

  it('accepts a сумісник’s additional кафедра', async () => {
    (db.staff.findUnique as Mock).mockResolvedValue({
      ...STAFF,
      departmentId: null,
      partTimeDepartments: [{ departmentId: 'd2' }],
    });
    expect(await saveRecord({ ...base, departmentId: 'd2' })).toEqual({ ok: true, recordId: 'r1' });
  });

  it('refuses a closed year', async () => {
    mockTemplate.mockResolvedValue({ ...TEMPLATE, status: 'CLOSED' });
    expect(await saveRecord(base)).toEqual({ error: 'Планування на цей рік закрито' });
  });

  it('refuses a deactivated or foreign work type', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(null);
    expect(await saveRecord(base)).toEqual({ error: 'Цей вид роботи недоступний' });
  });
});

describe('saveRecord — evidence', () => {
  it('refuses a record with neither link nor file (D27)', async () => {
    expect(await saveRecord({ ...base, link: undefined })).toEqual({
      error: 'Додайте посилання або файл підтвердження',
    });
  });

  it('refuses a link-only record where the type demands a file', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, requiresFile: true });
    expect(await saveRecord(base)).toEqual({
      error: 'Для цього виду роботи потрібен файл підтвердження',
    });
  });

  it('refuses evidence that fails the type’s own schema', async () => {
    expect(await saveRecord({ ...base, evidence: { title: 'Стаття' } })).toEqual({
      error: 'Невірні дані форми',
    });
  });

  it('refuses evidence that identifies nothing — no key, no work', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({
      ...ARTICLE,
      identityFields: ['doi'],
    });
    expect(await saveRecord({ ...base, evidence: { ...base.evidence } })).toEqual({
      error: 'Вкажіть назву або посилання, щоб роботу можна було розпізнати',
    });
  });
});

describe('saveRecord — creating the work', () => {
  it('freezes the pool at INTEGER HUNDREDTHS: 10 сторінок × 50 г = 500 год', async () => {
    const result = await saveRecord(base);
    expect(result).toEqual({ ok: true, recordId: 'r1' });

    const work = (db.scienceWork.create as Mock).mock.calls[0][0].data;
    expect(work.totalHundredths).toBe(50000);
    expect(Number.isInteger(work.totalHundredths)).toBe(true);
    expect(work.createdById).toBe('staff-1');
  });

  it('keys on the DOI when one is typed, and on the назва when none is', async () => {
    // The «Посилання» box is a separate column that PROVES the work (D27); it
    // is the evidence FIELDS that identify it. A person who pastes a doi.org
    // link into «Посилання» but leaves the DOI box empty is keyed by title,
    // which is the weaker key and the reason the DOI box exists.
    await saveRecord(base);
    expect((db.scienceWork.create as Mock).mock.calls[0][0].data.dedupKey).toBe(
      't:стаття про освіту'
    );

    vi.clearAllMocks();
    (db.staff.findUnique as Mock).mockResolvedValue(STAFF);
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(ARTICLE);
    (db.scienceWork.findUnique as Mock).mockResolvedValue(null);
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(LOCKED_PLAN);
    (db.scienceRecord.count as Mock).mockResolvedValue(0);
    (db.scienceWork.create as Mock).mockResolvedValue({ id: 'w1' });
    (db.scienceRecord.create as Mock).mockResolvedValue({ id: 'r1' });
    (db.$transaction as Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(db));

    await saveRecord({ ...base, evidence: { ...base.evidence, doi: '10.31392/XYZ' } });
    expect((db.scienceWork.create as Mock).mock.calls[0][0].data.dedupKey).toBe('doi:10.31392/xyz');
  });

  it('gives the creator the whole pool when they ask for nothing', async () => {
    await saveRecord(base);
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data.hoursHundredths).toBe(50000);
  });

  it('lets the creator of a SHARED work take less, leaving the rest for co-authors', async () => {
    await saveRecord({ ...base, hoursHundredths: 15000 });
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data.hoursHundredths).toBe(15000);
  });

  it('ignores a typed figure on an INDIVIDUAL work — there is no pool to divide', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({
      ...ARTICLE,
      sharing: 'INDIVIDUAL',
    });
    await saveRecord({ ...base, hoursHundredths: 100 });
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data.hoursHundredths).toBe(50000);
  });

  it('refuses a draw bigger than the work is worth', async () => {
    expect(await saveRecord({ ...base, hoursHundredths: 50001 })).toEqual({
      error: 'Залишилось 500 з 500 год',
    });
  });

  it('NEVER creates a plan — a fact with no plan has nothing to attach to', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue(null);
    expect(await saveRecord(base)).toEqual({
      error: 'Спочатку збережіть план — після цього можна вносити виконане',
    });
    expect(db.sciencePlan.create).not.toHaveBeenCalled();
  });

  it('writes an audit entry', async () => {
    await saveRecord(base);
    expect(db.auditLog.create).toHaveBeenCalled();
    expect((db.auditLog.create as Mock).mock.calls[0][0].data.entity).toBe('ScienceRecord');
  });
});

describe('saveRecord — the work already exists (D17)', () => {
  const existing = {
    id: 'w1',
    totalHundredths: 20000,
    evidence: { title: 'Стаття про освіту' },
    createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
    records: [{ staffId: 'other', hoursHundredths: 15000 }],
  };

  it('returns a CONFLICT naming who has it and what is left — not an error', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(existing);
    expect(await saveRecord(base)).toEqual({
      conflict: {
        workId: 'w1',
        createdByName: 'Іваненко І. І.',
        summary: expect.any(String),
        totalHundredths: 20000,
        remainingHundredths: 5000,
      },
    });
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('tells a person who already drew on it, rather than offering the join again', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...existing,
      records: [{ staffId: 'staff-1', hoursHundredths: 5000 }],
    });
    expect(await saveRecord(base)).toEqual({ error: 'Ви вже додали цю роботу' });
  });

  it('ignores a declined draw when counting what is left', async () => {
    // A REMOVED record holds no hours — the query filters on APPROVED, so the
    // pool it was holding is free again.
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...existing, records: [] });
    const result = await saveRecord(base);
    expect(result).toMatchObject({ conflict: { remainingHundredths: 20000 } });
  });

  it('turns a dedupKey race into the same conflict, not a 500', async () => {
    (db.scienceWork.findUnique as Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...existing, records: [] });
    (db.$transaction as Mock).mockRejectedValueOnce(unique(['dedupKey']));

    expect(await saveRecord(base)).toMatchObject({
      conflict: { workId: 'w1', createdByName: 'Іваненко І. І.' },
    });
  });
});

describe('saveRecord — the caps and the plan row', () => {
  it('refuses a work type already at its maxPerYear', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, maxPerYear: 5 });
    (db.scienceRecord.count as Mock).mockResolvedValue(5);
    expect(await saveRecord(base)).toEqual({
      error: 'Не більше 5 записів цього виду роботи на рік',
    });
  });

  it('counts only APPROVED records toward the cap', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, maxPerYear: 5 });
    await saveRecord(base);
    expect((db.scienceRecord.count as Mock).mock.calls[0][0].where.status).toBe('APPROVED');
  });

  it('links the record to a plan row of the same вид роботи', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      planId: 'plan-1',
      workTypeId: 'wt1',
    });
    await saveRecord({ ...base, planRowId: 'pr1' });
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data.planRowId).toBe('pr1');
  });

  it('refuses a plan row belonging to somebody else', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      planId: 'someone-elses-plan',
      workTypeId: 'wt1',
    });
    expect(await saveRecord({ ...base, planRowId: 'pr1' })).toEqual({
      error: 'Рядок плану не знайдено',
    });
  });

  it('refuses a plan row of a different вид роботи', async () => {
    (db.sciencePlanRow.findUnique as Mock).mockResolvedValue({
      planId: 'plan-1',
      workTypeId: 'another-type',
    });
    expect(await saveRecord({ ...base, planRowId: 'pr1' })).toEqual({
      error: 'Рядок плану не знайдено',
    });
  });
});

describe('joinWork — D17 in practice', () => {
  const WORK = {
    id: 'w1',
    templateId: 't1',
    totalHundredths: 20000,
    workType: ARTICLE,
    evidence: { title: 'Стаття про освіту' },
  };

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
  });

  it('creates a draw against the existing work, on the joiner’s own plan', async () => {
    const result = await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 });
    expect(result).toEqual({ ok: true, recordId: 'r1' });

    const data = (db.scienceRecord.create as Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ workId: 'w1', staffId: 'staff-1', hoursHundredths: 5000 });
    // The WORK is never touched — its evidence and its pool belong to whoever
    // entered it (spec, «Correcting a work»).
    expect(db.scienceWork.create).not.toHaveBeenCalled();
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('refuses more hours than the pool has left, naming what is left', async () => {
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 15000 } });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5001 })).toEqual({
      error: 'Залишилось 50 з 200 год',
    });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
  });

  it('re-reads the drawn sum INSIDE the transaction, never from the client', async () => {
    // Two co-authors both saw «50 год залишилось» on screen. The second must
    // lose — the same rule `saveDistribution` follows for a кафедра's pool.
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    const result = await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 });
    expect(result).toEqual({ error: 'Залишилось 0 з 200 год' });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
  });

  it('excludes the caller’s own draw and every declined one from the sum', async () => {
    await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 });
    const where = (db.scienceRecord.aggregate as Mock).mock.calls[0][0].where;
    expect(where.status).toBe('APPROVED');
    expect(where.staffId).toEqual({ not: 'staff-1' });
  });

  it('refuses joining an INDIVIDUAL work — it has no pool to share', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      workType: { ...ARTICLE, sharing: 'INDIVIDUAL' },
    });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Ця робота індивідуальна — до неї не можна приєднатися',
    });
  });

  it('refuses a work from another навчальний рік', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, templateId: 'old-template' });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Роботу не знайдено',
    });
  });

  it('refuses a кафедра the joiner does not work on', async () => {
    expect(await joinWork({ workId: 'w1', departmentId: 'other', hoursHundredths: 100 })).toEqual({
      error: 'Ви не працюєте на цій кафедрі',
    });
  });

  it('refuses a closed year', async () => {
    mockTemplate.mockResolvedValue({ ...TEMPLATE, status: 'CLOSED' });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Планування на цей рік закрито',
    });
  });

  it('turns the double-claim race into a plain message', async () => {
    (db.$transaction as Mock).mockRejectedValueOnce(unique(['staffId', 'workId']));
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Ви вже додали цю роботу',
    });
  });

  it('audits the join — who attached themselves to what, and for how much', async () => {
    await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 });
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.entity).toBe('ScienceRecord');
    expect(entry.action).toBe('CREATE');
  });
});

describe('updateWorkEvidence — correcting a work', () => {
  const WORK = {
    id: 'w1',
    templateId: 't1',
    totalHundredths: 50000,
    evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 10 },
    link: 'https://example.com/a',
    createdById: 'staff-1',
    workType: ARTICLE,
  };

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
    (db.scienceWork.update as Mock).mockResolvedValue({ id: 'w1' });
  });

  it('refuses anybody but the creator and ADMIN', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'someone-else' });
    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link })
    ).toEqual({ error: 'Редагувати роботу може лише той, хто її додав' });
  });

  it('lets ADMIN correct anybody’s work', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', staffId: 'staff-9', role: 'ADMIN' } });
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'someone-else' });
    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link })
    ).toEqual({ ok: true });
  });

  it('refuses an edit that would put the pool below what is already drawn', async () => {
    // 10 сторінок → 2 сторінки moves the pool from 500 to 100 год, and 300 are
    // already taken by co-authors.
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 30000 } });
    const result = await updateWorkEvidence({
      workId: 'w1',
      evidence: { ...WORK.evidence, credits: 2 },
      link: WORK.link,
    });
    expect(result).toMatchObject({ error: expect.stringContaining('300') });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('allows an edit that still covers every draw', async () => {
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 5000 } });
    expect(
      await updateWorkEvidence({
        workId: 'w1',
        evidence: { ...WORK.evidence, credits: 2 },
        link: WORK.link,
      })
    ).toEqual({ ok: true });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.totalHundredths).toBe(10000);
  });

  it('recomputes the dedupKey when the identity changes', async () => {
    await updateWorkEvidence({
      workId: 'w1',
      evidence: { ...WORK.evidence, title: 'Інша назва' },
      link: WORK.link,
    });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.dedupKey).toBe('t:інша назва');
  });

  it('names the collision when the new identity belongs to another work', async () => {
    (db.scienceWork.update as Mock).mockRejectedValue(unique(['dedupKey']));
    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link })
    ).toEqual({ error: 'Робота з такими даними вже існує' });
  });

  it('refuses an edit that leaves the work with no evidence at all (D27)', async () => {
    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: undefined })
    ).toEqual({ error: 'Додайте посилання або файл підтвердження' });
  });

  it('refuses a work from a closed year', async () => {
    mockTemplate.mockResolvedValue({ ...TEMPLATE, status: 'CLOSED' });
    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link })
    ).toEqual({ error: 'Планування на цей рік закрито' });
  });
});

describe('deleteRecord — withdrawing a draw', () => {
  const RECORD = {
    id: 'r1',
    staffId: 'staff-1',
    templateId: 't1',
    hoursHundredths: 5000,
    work: { id: 'w1', workType: { label: 'Наукова стаття' } },
  };

  beforeEach(() => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(RECORD);
    (db.scienceRecord.delete as Mock).mockResolvedValue(RECORD);
  });

  it('refuses somebody else’s record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, staffId: 'other' });
    expect(await deleteRecord('r1')).toEqual({ error: 'Запис не знайдено' });
  });

  it('refuses a record from a closed year', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, templateId: 'old' });
    expect(await deleteRecord('r1')).toEqual({ error: 'Запис не знайдено' });
  });

  it('deletes the draw and LEAVES the work standing', async () => {
    // The work's dedupKey is what stops it being re-entered, and a co-author
    // may still be drawing on it (spec, «Deleting the last claim does not
    // delete the work»).
    expect(await deleteRecord('r1')).toEqual({ ok: true });
    expect(db.scienceRecord.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(db.scienceWork.delete).not.toHaveBeenCalled();
  });

  it('audits the withdrawal', async () => {
    await deleteRecord('r1');
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.action).toBe('DELETE');
    expect(entry.entity).toBe('ScienceRecord');
  });
});

describe('a fact needs a submitted plan — and nothing more', () => {
  it('refuses while the plan is still open', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({ ...LOCKED_PLAN, lockedAt: null });
    expect(await saveRecord(base)).toEqual({
      error: 'Спочатку збережіть план — після цього можна вносити виконане',
    });
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('ACCEPTS a вид роботи the person never planned (owner, 2026-09-17)', async () => {
    // The plan says what somebody intended and, through that, the hours they
    // must reach. It does not limit what they may do: an НПП who planned
    // аспіранти and published an article still did the article, and Додаток III
    // still prices it. An earlier build refused this and was retracted the
    // same day.
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({ ...LOCKED_PLAN, rows: [] });
    expect(await saveRecord(base)).toEqual({ ok: true, recordId: 'r1' });
  });

  it('counts the FACT’s own hours, not the planned figure', async () => {
    // September planned «п.4, Scopus, 10 сторінок» = 500 год. May publishes a
    // different Scopus article of 6 сторінок. It counts for 300, not 500 —
    // план and факт are compared as hours, and the наказ prices per сторінка.
    const result = await saveRecord({
      ...base,
      evidence: { ...base.evidence, title: 'Зовсім інша стаття', credits: 6 },
    });
    expect(result).toEqual({ ok: true, recordId: 'r1' });
    expect((db.scienceWork.create as Mock).mock.calls[0][0].data.totalHundredths).toBe(30000);
  });

  it('applies the same rule to joining somebody else’s work', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 20000,
      workType: ARTICLE,
    });
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({ ...LOCKED_PLAN, lockedAt: null });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 })).toEqual({
      error: 'Спочатку збережіть план — після цього можна вносити виконане',
    });
  });
});
