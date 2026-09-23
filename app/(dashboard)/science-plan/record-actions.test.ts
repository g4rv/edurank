import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    sciencePlan: { findUnique: vi.fn(), create: vi.fn() },
    scienceRecordFile: { create: vi.fn() },
    sciencePlanRow: { findUnique: vi.fn() },
    stakeAllocation: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('@/lib/queries/get-science-template', () => ({ getActiveScienceTemplate: vi.fn() }));
// The intake helper is exercised end-to-end in `file-actions.test.ts` against
// real bytes; here it is stubbed so these tests stay about what `saveRecord`
// DOES with a verified file, not about magic bytes. The message constants and
// the P2002 test stay real.
vi.mock('@/lib/science/file-intake', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/science/file-intake')>();
  return { ...actual, verifyUploadedObject: vi.fn(), safeDeleteObject: vi.fn() };
});

import { Prisma } from '@/lib/generated/prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
import {
  deleteRecord,
  joinWork,
  saveRecord,
  updateRecordHours,
  updateWorkEvidence,
} from './record-actions';

const mockAuth = auth as unknown as Mock;
const mockTemplate = getActiveScienceTemplate as unknown as Mock;
const mockVerifyFile = verifyUploadedObject as unknown as Mock;
const mockDropObject = safeDeleteObject as unknown as Mock;

/** What the browser already put in R2, and what the server made of it. */
const STAGED = { objectKey: 'evidence/t1/abc.pdf', fileName: 'сертифікат.pdf' };
const VERIFIED = {
  ...STAGED,
  contentType: 'application/pdf',
  sizeBytes: 2048,
  pageCount: 3,
  sha256: 'c'.repeat(64),
};

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
  linkRule: 'OPTIONAL' as const,
  fileRule: 'OPTIONAL' as const,
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

const TEMPLATE = {
  id: 't1',
  academicYear: '2026/2027',
  status: 'OPEN',
  stakeYear: 2026,
  lastExecutionMonth: 6,
};

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
  // D41: this month, under the frozen clock below.
  executedMonth: '2026-10',
};

beforeEach(() => {
  vi.clearAllMocks();
  // D42 reads «this month», so the clock is frozen: 15 October 2026. Only Date
  // is faked, so the promise-based transaction mocks still run.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
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
  (db.scienceRecordFile.create as Mock).mockResolvedValue({ id: 'f1' });
  mockVerifyFile.mockResolvedValue({ ok: true, file: VERIFIED });
  mockDropObject.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(await saveRecord({ ...base, departmentId: 'd2' })).toEqual({
      ok: true,
      recordId: 'r1',
      workId: 'w1',
    });
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
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, fileRule: 'REQUIRED' });
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

describe('saveRecord — D47, the link and the file rules', () => {
  const LINK_ONLY = { ...ARTICLE, linkRule: 'REQUIRED' as const, fileRule: 'NONE' as const };

  it('refuses a file on a link-only type and drops the object', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(LINK_ONLY);
    expect(await saveRecord({ ...base, file: STAGED })).toEqual({
      error: 'Для цього виду роботи додається лише посилання, без файлу',
    });
    expect(mockDropObject).toHaveBeenCalledWith('science.saveRecord', STAGED.objectKey, {
      userId: 'u1',
    });
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('saves the same record with the link alone', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(LINK_ONLY);
    expect(await saveRecord(base)).toMatchObject({ ok: true });
  });

  it('refuses a link-only type with no link', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue(LINK_ONLY);
    expect(await saveRecord({ ...base, link: undefined })).toEqual({
      error: 'Для цього виду роботи потрібне посилання',
    });
  });

  it('refuses a link on a type that takes no link', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({
      ...ARTICLE,
      linkRule: 'NONE',
      fileRule: 'REQUIRED',
    });
    expect(await saveRecord({ ...base, file: STAGED })).toEqual({
      error: 'Для цього виду роботи посилання не додається — лише файл',
    });
    expect(mockDropObject).toHaveBeenCalled();
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });
});

describe('saveRecord — D41/D48, the month', () => {
  it('stores the month as the 1st of it', async () => {
    await saveRecord({ ...base, executedMonth: '2026-09' });
    expect((db.scienceWork.create as Mock).mock.calls[0][0].data.executedMonth).toEqual(
      new Date('2026-09-01T00:00:00Z')
    );
  });

  it('refuses a month before the навчальний рік, and drops the file', async () => {
    // August belongs to the previous year's plan.
    const result = await saveRecord({ ...base, executedMonth: '2026-08', file: STAGED });
    expect(result).toEqual({
      error: 'Місяць виконання має бути в межах 2026/2027 навчального року',
    });
    expect(mockDropObject).toHaveBeenCalled();
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('refuses the future', async () => {
    expect(await saveRecord({ ...base, executedMonth: '2026-11' })).toEqual({
      error: 'Місяць виконання не може бути в майбутньому',
    });
  });

  it('refuses a missing month', async () => {
    expect(await saveRecord({ ...base, executedMonth: '' })).toEqual({
      error: 'Оберіть місяць виконання',
    });
  });
});

describe('saveRecord — «Робота тривала кілька місяців»', () => {
  it('stores the start beside the finish; the hours stay whole', async () => {
    await saveRecord({ ...base, startedMonth: '2026-09', executedMonth: '2026-10' });
    const data = (db.scienceWork.create as Mock).mock.calls[0][0].data;
    expect(data.startedMonth).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(data.executedMonth).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(data.totalHundredths).toBe(50000);
  });

  it('stores no start for a one-month work', async () => {
    await saveRecord(base);
    expect((db.scienceWork.create as Mock).mock.calls[0][0].data.startedMonth).toBeNull();
  });

  it('refuses a start that is not before the finish, and drops the file', async () => {
    expect(
      await saveRecord({ ...base, startedMonth: '2026-10', executedMonth: '2026-10', file: STAGED })
    ).toEqual({ error: 'Місяць початку має бути раніше за місяць завершення' });
    expect(mockDropObject).toHaveBeenCalled();
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('refuses a start before the навчальний рік', async () => {
    expect(await saveRecord({ ...base, startedMonth: '2026-06' })).toEqual({
      error: 'Місяць виконання має бути в межах 2026/2027 навчального року',
    });
  });
});

describe('saveRecord — evidence by FILE (D27)', () => {
  it('SAVES a record proved by a file and no link at all', async () => {
    // The case the whole stage exists for: a сертифікат with no public page.
    // It was impossible before — `evidenceProblem` was called with a
    // hardcoded `fileCount: 0`, because the file could only be uploaded after
    // the record was saved, so a link was mandatory in practice.
    const result = await saveRecord({ ...base, link: undefined, file: STAGED });
    expect(result).toMatchObject({ ok: true });
    expect(mockDropObject).not.toHaveBeenCalled();
  });

  it('writes the file row inside the SAME transaction as the work', async () => {
    await saveRecord({ ...base, link: undefined, file: STAGED });
    expect(db.scienceRecordFile.create).toHaveBeenCalledTimes(1);
    expect((db.scienceRecordFile.create as Mock).mock.calls[0][0].data).toMatchObject({
      workId: 'w1',
      uploadedById: 'staff-1',
      sha256: VERIFIED.sha256,
      pageCount: 3,
    });
  });

  it('verifies the STORED object before the evidence rule reads its count', async () => {
    await saveRecord({ ...base, link: undefined, file: STAGED });
    expect(mockVerifyFile).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: STAGED.objectKey })
    );
  });

  it('refuses the file the verification refused, and never saves', async () => {
    mockVerifyFile.mockResolvedValue({ error: 'Цей файл уже використано в іншому записі' });
    expect(await saveRecord({ ...base, link: undefined, file: STAGED })).toEqual({
      error: 'Цей файл уже використано в іншому записі',
    });
    expect(db.scienceWork.create).not.toHaveBeenCalled();
  });

  it('still refuses a record with NEITHER link nor file', async () => {
    expect(await saveRecord({ ...base, link: undefined })).toEqual({
      error: 'Додайте посилання або файл підтвердження',
    });
  });

  it('accepts a link-only record where the type demands a file, once a file is there', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, fileRule: 'REQUIRED' });
    expect(await saveRecord({ ...base, file: STAGED })).toMatchObject({ ok: true });
  });
});

describe('saveRecord — a refused save never leaves an object in the bucket', () => {
  it('drops it when the work already exists (the conflict is an offer, not a save)', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w-existing',
      templateId: 't1',
      totalHundredths: 20000,
      evidence: { title: 'Стаття про освіту' },
      template: { academicYear: '2026/2027' },
      createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
      records: [{ staffId: 'other', hoursHundredths: 15000 }],
    });
    const result = await saveRecord({ ...base, file: STAGED });
    expect(result).toHaveProperty('conflict');
    expect(mockDropObject).toHaveBeenCalledWith('science.saveRecord', STAGED.objectKey, {
      userId: 'u1',
    });
  });

  it('drops it when the evidence identifies nothing', async () => {
    (db.scienceWorkType.findFirst as Mock).mockResolvedValue({
      ...ARTICLE,
      identityFields: ['doi'],
    });
    await saveRecord({ ...base, file: STAGED });
    expect(mockDropObject).toHaveBeenCalledWith('science.saveRecord', STAGED.objectKey, {
      userId: 'u1',
    });
  });

  it('drops it when the transaction itself rolls back', async () => {
    (db.$transaction as Mock).mockRejectedValueOnce(new Error('deadlock'));
    await saveRecord({ ...base, file: STAGED });
    expect(mockDropObject).toHaveBeenCalledWith('science.saveRecord', STAGED.objectKey, {
      userId: 'u1',
    });
  });

  it('drops it when the plan is not submitted yet', async () => {
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({ ...LOCKED_PLAN, lockedAt: null });
    expect(await saveRecord({ ...base, file: STAGED })).toEqual({
      error: 'Спочатку збережіть план — після цього можна вносити виконане',
    });
    expect(mockDropObject).toHaveBeenCalled();
  });
});

describe('saveRecord — creating the work', () => {
  it('freezes the pool at INTEGER HUNDREDTHS: 10 сторінок × 50 г = 500 год', async () => {
    const result = await saveRecord(base);
    expect(result).toEqual({ ok: true, recordId: 'r1', workId: 'w1' });

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
    templateId: 't1',
    totalHundredths: 20000,
    evidence: { title: 'Стаття про освіту' },
    template: { academicYear: '2026/2027' },
    createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
    records: [{ staffId: 'other', hoursHundredths: 15000 }],
  };

  /** The SAME article, entered in a рік that has since closed. A SHARED+ONCE
   *  key carries no year, so the lookup finds it — and nothing about it can be
   *  drawn now. */
  const lastYear = {
    ...existing,
    templateId: 't-2025',
    template: { academicYear: '2025/2026' },
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
        fromYear: null,
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

  it('NAMES the рік when the work belongs to a closed one', async () => {
    // Previously this offered «Приєднатися» over a closed рік's pool, and
    // `joinWork` then answered «Роботу не знайдено» (owner, 2026-09-20).
    (db.scienceWork.findUnique as Mock).mockResolvedValue(lastYear);
    expect(await saveRecord(base)).toMatchObject({
      conflict: { fromYear: '2025/2026', createdByName: 'Іваненко І. І.' },
    });
  });

  it('quotes NO remainder for another рік — that pool is not on offer', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(lastYear);
    expect(await saveRecord(base)).toMatchObject({
      conflict: { remainingHundredths: 0 },
    });
  });

  it('prefers the рік explanation over «Ви вже додали цю роботу»', async () => {
    // Their own draw, but from last рік: naming the рік answers what they
    // actually asked, where «вже додали» reads as if it meant this рік.
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...lastYear,
      records: [{ staffId: 'staff-1', hoursHundredths: 5000 }],
    });
    expect(await saveRecord(base)).toMatchObject({ conflict: { fromYear: '2025/2026' } });
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
    template: { academicYear: '2026/2027' },
    workType: ARTICLE,
    evidence: { title: 'Стаття про освіту' },
  };

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
  });

  it('creates a draw against the existing work, on the joiner’s own plan', async () => {
    const result = await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 5000 });
    expect(result).toEqual({ ok: true, recordId: 'r1', workId: 'w1' });

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

  it('refuses a work from another навчальний рік, and NAMES that рік', async () => {
    // «Роботу не знайдено» was the old answer, on the reasoning that such a
    // work is not on the person's screen anyway — which the conflict panel
    // made untrue (owner, 2026-09-20).
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      templateId: 'old-template',
      template: { academicYear: '2025/2026' },
    });
    expect(await joinWork({ workId: 'w1', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
      error: 'Цю роботу внесено у 2025/2026 н.р. — години за неї нараховуються в тому році',
    });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
  });

  it('still says «не знайдено» when there really is no such work', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(null);
    expect(await joinWork({ workId: 'nope', departmentId: 'd1', hoursHundredths: 100 })).toEqual({
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
    // The REAL file count. It used to be hardcoded to 0 in the action, which
    // meant a work proved by a file alone (D27) was refused the moment its
    // author corrected a page number.
    _count: { files: 0 },
    executedMonth: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
    (db.scienceWork.update as Mock).mockResolvedValue({ id: 'w1' });
  });

  it('reaches a non-НПП ADMIN — the escape hatch was unreachable for most of them', async () => {
    // Six of the eight real ADMIN accounts are `isNpp: false`, the rector's
    // among them. `resolveActor` refused them before the `isAdmin` branch was
    // ever read, so «ADMIN may edit anything» existed only on paper.
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: false });
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'someone-else' });

    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link })
    ).toEqual({ ok: true });
  });

  it('still refuses a non-НПП who is NOT an ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'EDITOR' } });
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: false });
    expect(
      await updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link })
    ).toEqual({ error: 'Облік наукової роботи доступний лише для НПП' });
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

describe('updateWorkEvidence — the month', () => {
  const WORK = {
    id: 'w1',
    templateId: 't1',
    totalHundredths: 50000,
    evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 10 },
    link: 'https://example.com/a',
    createdById: 'staff-1',
    workType: ARTICLE,
    _count: { files: 0 },
    executedMonth: new Date('2026-09-01T00:00:00Z'),
  };
  const edit = (executedMonth?: string) =>
    updateWorkEvidence({ workId: 'w1', evidence: WORK.evidence, link: WORK.link, executedMonth });

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
    (db.scienceWork.update as Mock).mockResolvedValue({ id: 'w1' });
  });

  it('moves the month within the навчальний рік', async () => {
    expect(await edit('2026-10')).toEqual({ ok: true });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.executedMonth).toEqual(
      new Date('2026-10-01T00:00:00Z')
    );
  });

  it('records a start when the work turns out to have taken several months', async () => {
    expect(
      await updateWorkEvidence({
        workId: 'w1',
        evidence: WORK.evidence,
        link: WORK.link,
        executedMonth: '2026-10',
        startedMonth: '2026-09',
      })
    ).toEqual({ ok: true });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.startedMonth).toEqual(
      new Date('2026-09-01T00:00:00Z')
    );
  });

  it('clears the start with null — «one month after all»', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      startedMonth: new Date('2026-09-01T00:00:00Z'),
      executedMonth: new Date('2026-10-01T00:00:00Z'),
    });
    expect(
      await updateWorkEvidence({
        workId: 'w1',
        evidence: WORK.evidence,
        link: WORK.link,
        startedMonth: null,
      })
    ).toEqual({ ok: true });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.startedMonth).toBeNull();
  });

  it('refuses a start that is not before the finish', async () => {
    expect(
      await updateWorkEvidence({
        workId: 'w1',
        evidence: WORK.evidence,
        link: WORK.link,
        startedMonth: '2026-10',
      })
    ).toEqual({ error: 'Місяць початку має бути раніше за місяць завершення' });
  });

  it('keeps the stored month when none is sent', async () => {
    expect(await edit(undefined)).toEqual({ ok: true });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.executedMonth).toBeUndefined();
  });

  it('keeps an unchanged month even when it is outside the year', async () => {
    // Saved in time; the window has moved past it since. A typo fix in the
    // title must not be refused for that.
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      executedMonth: new Date('2025-08-01T00:00:00Z'),
    });
    expect(await edit('2025-08')).toEqual({ ok: true });
  });

  it('refuses moving it out of the навчальний рік', async () => {
    expect(await edit('2024-01')).toEqual({
      error: 'Місяць виконання має бути в межах 2026/2027 навчального року',
    });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });
});

describe('updateWorkEvidence — an INDIVIDUAL work follows its own claim', () => {
  /** A конференція: 6 год per day, INDIVIDUAL, one claim that IS the pool. */
  const CONFERENCE = {
    ...ARTICLE,
    id: 'wt2',
    code: 'conference_attendance',
    label: 'Участь у конференції',
    sharing: 'INDIVIDUAL' as const,
    reuse: 'YEARLY' as const,
    identityFields: ['title'],
    scoring: { kind: 'MULT' },
    coefficient: 6,
    evidenceFields: [
      { kind: 'text', name: 'title', label: 'Назва конференції' },
      // MULT reads the field literally named `value` — the shape the seeded
      // `conference_attendance` row uses.
      { kind: 'number', name: 'value', label: 'Кількість днів участі', min: 1 },
    ],
  };

  const WORK = {
    id: 'w2',
    templateId: 't1',
    totalHundredths: 3000, // 5 days × 6 год
    evidence: { title: 'Конференція з освіти', value: 5 },
    link: 'https://example.com/conf',
    createdById: 'staff-1',
    workType: CONFERENCE,
    _count: { files: 0 },
    executedMonth: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
    (db.scienceWork.update as Mock).mockResolvedValue({ id: 'w2' });
    (db.scienceRecord.updateMany as Mock).mockResolvedValue({ count: 1 });
  });

  it('lets the owner CUT the hours — five days down to three', async () => {
    // The ordinary correction, and it used to be refused: the shared-pool
    // guard compared 18 год against the 30 already «drawn» and answered
    // «робота вже поділена на 30 год» — about a division of one.
    const result = await updateWorkEvidence({
      workId: 'w2',
      evidence: { title: 'Конференція з освіти', value: 3 },
      link: 'https://example.com/conf',
    });
    expect(result).toEqual({ ok: true });
    expect((db.scienceWork.update as Mock).mock.calls[0][0].data.totalHundredths).toBe(1800);
  });

  it('moves the single claim with the pool it always equalled', async () => {
    await updateWorkEvidence({
      workId: 'w2',
      evidence: { title: 'Конференція з освіти', value: 3 },
      link: 'https://example.com/conf',
    });
    expect(db.scienceRecord.updateMany).toHaveBeenCalledWith({
      where: { workId: 'w2' },
      data: { hoursHundredths: 1800 },
    });
  });

  it('measures against what OTHERS hold, never the editor’s own draw', async () => {
    await updateWorkEvidence({
      workId: 'w2',
      evidence: { title: 'Конференція з освіти', value: 3 },
      link: 'https://example.com/conf',
    });
    const where = (db.scienceRecord.aggregate as Mock).mock.calls[0][0].where;
    expect(where.staffId).toEqual({ not: 'staff-1' });
  });

  it('lets a SOLO author of a SHARED work cut their own page count', async () => {
    // Most articles have one author, and the old rule counted their own draw
    // against them: 12 сторінок down to 10 was refused as «робота вже
    // поділена».
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 60000,
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 12 },
      link: 'https://example.com/a',
      createdById: 'staff-1',
      workType: ARTICLE,
      _count: { files: 0 },
      executedMonth: new Date('2026-09-01T00:00:00Z'),
    });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 0 } });

    const result = await updateWorkEvidence({
      workId: 'w1',
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 10 },
      link: 'https://example.com/a',
    });
    expect(result).toEqual({ ok: true });
  });

  it('REFUSES a cut below what co-authors already took, and names their share', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 50000,
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 10 },
      link: 'https://example.com/a',
      createdById: 'staff-1',
      workType: ARTICLE,
      _count: { files: 0 },
      executedMonth: new Date('2026-09-01T00:00:00Z'),
    });
    // Somebody else holds 300 год of the 500.
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 30000 } });

    expect(
      await updateWorkEvidence({
        workId: 'w1',
        evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 4 },
        link: 'https://example.com/a',
      })
    ).toEqual({ error: 'Співавтори вже взяли 300 год — менше цього зробити не можна' });
  });

  it('pulls only the EDITOR’s own claim down, never a co-author’s', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      id: 'w1',
      templateId: 't1',
      totalHundredths: 50000,
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 10 },
      link: 'https://example.com/a',
      createdById: 'staff-1',
      workType: ARTICLE,
      _count: { files: 0 },
      executedMonth: new Date('2026-09-01T00:00:00Z'),
    });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    await updateWorkEvidence({
      workId: 'w1',
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 6 },
      link: 'https://example.com/a',
    });
    const where = (db.scienceRecord.updateMany as Mock).mock.calls[0][0].where;
    expect(where.staffId).toBe('staff-1');
    // 300 год pool − 200 held by others = 100 left for the editor, and only
    // if their own draw was above it.
    expect(where.hoursHundredths).toEqual({ gt: 10000 });
  });

  it('accepts an edit on a work proved by a FILE and no link', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      link: null,
      _count: { files: 1 },
      executedMonth: new Date('2026-09-01T00:00:00Z'),
    });
    const result = await updateWorkEvidence({
      workId: 'w2',
      evidence: { title: 'Конференція з освіти', value: 4 },
    });
    expect(result).toEqual({ ok: true });
  });

  it('still refuses an edit that leaves NO evidence at all', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      link: null,
      _count: { files: 0 },
      executedMonth: new Date('2026-09-01T00:00:00Z'),
    });
    expect(
      await updateWorkEvidence({
        workId: 'w2',
        evidence: { title: 'Конференція з освіти', value: 4 },
      })
    ).toEqual({ error: 'Додайте посилання або файл підтвердження' });
  });
});

describe('deleteRecord — withdrawing a draw', () => {
  const RECORD = {
    id: 'r1',
    staffId: 'staff-1',
    templateId: 't1',
    hoursHundredths: 5000,
    work: {
      id: 'w1',
      workType: { label: 'Наукова стаття', sharing: 'SHARED' as const },
      files: [] as { objectKey: string }[],
    },
  };

  /** A конференція: INDIVIDUAL, so its dedupKey is already scoped to one
   *  person and no co-author can ever hold it. */
  const INDIVIDUAL_RECORD = {
    ...RECORD,
    work: {
      id: 'w2',
      workType: { label: 'Участь у конференції', sharing: 'INDIVIDUAL' as const },
      files: [] as { objectKey: string }[],
    },
  };

  beforeEach(() => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(RECORD);
    (db.scienceRecord.delete as Mock).mockResolvedValue(RECORD);
    (db.scienceWork.delete as Mock).mockResolvedValue({ id: 'w1' });
  });

  it('refuses somebody else’s record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, staffId: 'other' });
    expect(await deleteRecord('r1')).toEqual({ error: 'Запис не знайдено' });
  });

  it('refuses a record from a closed year', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, templateId: 'old' });
    expect(await deleteRecord('r1')).toEqual({ error: 'Запис не знайдено' });
  });

  it('deletes an ORPHANED INDIVIDUAL work with the last draw', async () => {
    // The dead end this closes: an INDIVIDUAL work's key is prefixed with the
    // owner's staffId (D24), so nobody else could ever collide with it, and
    // `joinWork` refuses an INDIVIDUAL work outright. Left standing after its
    // only claim went, it protected nothing and made that конференція
    // permanently un-recordable for the one person it belonged to.
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(INDIVIDUAL_RECORD);
    (db.scienceRecord.count as Mock).mockResolvedValue(0);

    expect(await deleteRecord('r1')).toEqual({ ok: true });
    expect(db.scienceWork.delete).toHaveBeenCalledWith({ where: { id: 'w2' } });
  });

  it('keeps an INDIVIDUAL work that still has another draw', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(INDIVIDUAL_RECORD);
    (db.scienceRecord.count as Mock).mockResolvedValue(1);

    await deleteRecord('r1');
    expect(db.scienceWork.delete).not.toHaveBeenCalled();
  });

  it('NEVER deletes a SHARED work, even with no draws left', async () => {
    // A co-author may still join it, and its key is what stops the article
    // being entered twice university-wide.
    (db.scienceRecord.count as Mock).mockResolvedValue(0);
    await deleteRecord('r1');
    expect(db.scienceWork.delete).not.toHaveBeenCalled();
  });

  it('clears the orphaned work’s R2 objects AFTER the commit', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...INDIVIDUAL_RECORD,
      work: { ...INDIVIDUAL_RECORD.work, files: [{ objectKey: 'evidence/t1/gone.pdf' }] },
    });
    (db.scienceRecord.count as Mock).mockResolvedValue(0);

    await deleteRecord('r1');
    expect(mockDropObject).toHaveBeenCalledWith('science.deleteRecord', 'evidence/t1/gone.pdf', {
      userId: 'u1',
      entityId: 'r1',
    });
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
    expect(await saveRecord(base)).toEqual({ ok: true, recordId: 'r1', workId: 'w1' });
  });

  it('counts the FACT’s own hours, not the planned figure', async () => {
    // September planned «п.4, Scopus, 10 сторінок» = 500 год. May publishes a
    // different Scopus article of 6 сторінок. It counts for 300, not 500 —
    // план and факт are compared as hours, and the наказ prices per сторінка.
    const result = await saveRecord({
      ...base,
      evidence: { ...base.evidence, title: 'Зовсім інша стаття', credits: 6 },
    });
    expect(result).toEqual({ ok: true, recordId: 'r1', workId: 'w1' });
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

describe('updateRecordHours — D46, my own share', () => {
  const RECORD = {
    id: 'r1',
    staffId: 'staff-1',
    templateId: 't1',
    status: 'APPROVED',
    hoursHundredths: 15000,
    work: {
      id: 'w1',
      totalHundredths: 20000,
      workType: { label: 'Наукова стаття', sharing: 'SHARED' },
    },
  };

  beforeEach(() => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(RECORD);
    // A co-author holds 50 of the 200.
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 5000 } });
    (db.scienceRecord.update as Mock).mockResolvedValue({ id: 'r1' });
  });

  it('lowers my share and audits it', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      ok: true,
    });
    expect(db.scienceRecord.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { hoursHundredths: 10000 },
    });
    const { changes } = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(changes).toHaveProperty('hoursHundredths');
  });

  it('raises it up to exactly what the others left', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 15000 })).toEqual({
      ok: true,
    });
  });

  it('refuses taking hours a co-author holds', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 16000 })).toEqual({
      error: 'Залишилось 150 з 200 год',
    });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('measures against OTHERS only, never my own row, APPROVED only', async () => {
    await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 });
    expect(db.scienceRecord.aggregate).toHaveBeenCalledWith({
      where: { workId: 'w1', status: 'APPROVED', staffId: { not: 'staff-1' } },
      _sum: { hoursHundredths: true },
    });
  });

  it('refuses zero or less', async () => {
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 0 })).toEqual({
      error: 'Вкажіть кількість годин більше нуля',
    });
  });

  it('refuses somebody else’s record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, staffId: 'staff-2' });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Запис не знайдено',
    });
  });

  it('refuses a record of another year', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, templateId: 'old' });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Запис не знайдено',
    });
  });

  it('refuses a declined record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...RECORD, status: 'REMOVED' });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Відхилений запис змінити не можна',
    });
  });

  it('refuses an INDIVIDUAL work — its hours come from its data', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...RECORD,
      work: { ...RECORD.work, workType: { label: 'Конференція', sharing: 'INDIVIDUAL' } },
    });
    expect(await updateRecordHours({ recordId: 'r1', hoursHundredths: 10000 })).toEqual({
      error: 'Години цієї роботи визначаються її даними — змініть їх у «Редагувати»',
    });
  });
});
