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
      findMany: vi.fn(),
    },
    scienceCoauthorShare: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    sciencePlan: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
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
  lockPlan,
  resubmitScienceWork,
  saveRecord,
  updateCoauthors,
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
  minHoursPerRate: 500,
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
  // A co-author has no SAVED plan unless a test says so — the commoner case in
  // September, and the one that has to be handled without opening a plan.
  (db.sciencePlan.findMany as Mock).mockResolvedValue([]);
  (db.scienceRecord.findMany as Mock).mockResolvedValue([]);
  (db.scienceCoauthorShare.findMany as Mock).mockResolvedValue([]);
  (db.scienceCoauthorShare.create as Mock).mockResolvedValue({ id: 's1' });
  (db.scienceCoauthorShare.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 0 } });
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

  // The picker is hidden (2026-09-24): nobody chooses a month, so the save
  // month is stored — the column stays filled if the picker ever comes back.
  it('stores the month of saving when none is sent, and ignores a start', async () => {
    const { executedMonth: _, ...noMonth } = base;
    expect(await saveRecord({ ...noMonth, startedMonth: '2026-09' })).not.toHaveProperty('error');
    const data = (db.scienceWork.create as Mock).mock.calls[0][0].data;
    expect(data.executedMonth).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(data.startedMonth).toBeNull();
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
      createdById: 'other',
      template: { academicYear: '2026/2027' },
      createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
      records: [{ staffId: 'other' }],
      coauthorShares: [],
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

  it('gives the author the whole pool when there are no co-authors', async () => {
    await saveRecord(base);
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data.hoursHundredths).toBe(50000);
    expect(db.scienceCoauthorShare.create).not.toHaveBeenCalled();
  });

  describe('co-authors named by the author (owner, 2026-09-30)', () => {
    const named = (hoursHundredths: number, staffId = 'staff-2') => ({ staffId, hoursHundredths });
    const planOf = (id: string) =>
      (db.sciencePlan.findMany as Mock).mockResolvedValue([{ id, departmentId: 'd1' }]);
    const recordsCreated = () => (db.scienceRecord.create as Mock).mock.calls.map((c) => c[0].data);

    it('gives the author what is LEFT — their own share is never typed', async () => {
      planOf('plan-2');
      const result = await saveRecord({ ...base, coauthors: [named(15000)] });
      expect(result).toEqual({ ok: true, recordId: 'r1', workId: 'w1' });
      const [author, coauthor] = recordsCreated();
      expect(author).toMatchObject({ staffId: 'staff-1', hoursHundredths: 35000 });
      expect(coauthor).toMatchObject({
        staffId: 'staff-2',
        workId: 'w1',
        planId: 'plan-2',
        planRowId: null,
        hoursHundredths: 15000,
      });
    });

    it('reserves the hours of a co-author who has not saved a plan yet', async () => {
      // No record without a plan — and none is opened for them.
      await saveRecord({ ...base, coauthors: [named(15000)] });
      expect(recordsCreated()).toHaveLength(1);
      expect(db.scienceCoauthorShare.create).toHaveBeenCalledWith({
        data: { workId: 'w1', staffId: 'staff-2', hoursHundredths: 15000 },
        select: { id: true },
      });
      expect(db.sciencePlan.create).not.toHaveBeenCalled();
    });

    it('counts a reserved share against the pool exactly like a record', async () => {
      // One co-author holds a record, the other only a reservation: the author
      // keeps 500 − 150 − 100 = 250 either way.
      (db.sciencePlan.findMany as Mock)
        .mockResolvedValueOnce([{ id: 'plan-2', departmentId: 'd1' }])
        .mockResolvedValueOnce([]);
      await saveRecord({ ...base, coauthors: [named(15000), named(10000, 'staff-3')] });
      expect(recordsCreated()[0].hoursHundredths).toBe(25000);
      expect(db.scienceCoauthorShare.create).toHaveBeenCalledTimes(1);
    });

    it('prefers the co-author’s primary кафедра’s saved plan, and falls back to another', async () => {
      (db.sciencePlan.findMany as Mock).mockResolvedValue([
        { id: 'plan-other', departmentId: 'd9' },
        { id: 'plan-primary', departmentId: 'd1' },
      ]);
      await saveRecord({ ...base, coauthors: [named(15000)] });
      expect(recordsCreated()[1].planId).toBe('plan-primary');

      vi.clearAllMocks();
      (db.sciencePlan.findMany as Mock).mockResolvedValue([
        { id: 'plan-other', departmentId: 'd9' },
      ]);
      (db.sciencePlan.findUnique as Mock).mockResolvedValue(LOCKED_PLAN);
      (db.staff.findUnique as Mock).mockResolvedValue(STAFF);
      (db.scienceWorkType.findFirst as Mock).mockResolvedValue(ARTICLE);
      (db.scienceWork.findUnique as Mock).mockResolvedValue(null);
      (db.scienceRecord.count as Mock).mockResolvedValue(0);
      (db.scienceWork.create as Mock).mockResolvedValue({ id: 'w1' });
      (db.scienceRecord.create as Mock).mockResolvedValue({ id: 'r1' });
      (db.$transaction as Mock).mockImplementation(async (fn: (t: unknown) => unknown) => fn(db));
      await saveRecord({ ...base, coauthors: [named(15000)] });
      expect(recordsCreated()[1].planId).toBe('plan-other');
    });

    it('refuses a split that leaves the author nothing', async () => {
      const result = await saveRecord({ ...base, coauthors: [named(50000)] });
      expect(result).toMatchObject({ error: expect.stringContaining('вам має залишитися') });
      expect(db.scienceWork.create).not.toHaveBeenCalled();
    });

    it('refuses the author as their own co-author, and the same person twice', async () => {
      expect(await saveRecord({ ...base, coauthors: [named(100, 'staff-1')] })).toEqual({
        error: 'Ви не можете бути власним співавтором',
      });
      expect(await saveRecord({ ...base, coauthors: [named(100), named(200)] })).toEqual({
        error: 'Одного співавтора вказано двічі',
      });
    });

    it('refuses co-authors on an INDIVIDUAL work — it has no pool to divide', async () => {
      (db.scienceWorkType.findFirst as Mock).mockResolvedValue({
        ...ARTICLE,
        sharing: 'INDIVIDUAL',
      });
      expect(await saveRecord({ ...base, coauthors: [named(100)] })).toEqual({
        error: 'У цієї роботи не може бути співавторів',
      });
    });

    it('refuses somebody who is not an НПП on the roster', async () => {
      (db.staff.findUnique as Mock)
        .mockResolvedValueOnce(STAFF) // the author
        .mockResolvedValueOnce({ ...STAFF, isNpp: false });
      expect(await saveRecord({ ...base, coauthors: [named(15000)] })).toEqual({
        error: 'Співавтора не знайдено серед діючих НПП',
      });
    });

    it('refuses an archived person', async () => {
      (db.staff.findUnique as Mock)
        .mockResolvedValueOnce(STAFF)
        .mockResolvedValueOnce({ ...STAFF, archivedAt: new Date('2026-08-01') });
      expect(await saveRecord({ ...base, coauthors: [named(15000)] })).toEqual({
        error: 'Співавтора не знайдено серед діючих НПП',
      });
    });

    it('refuses a co-author already at their yearly cap, naming them', async () => {
      planOf('plan-2');
      (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ ...ARTICLE, maxPerYear: 2 });
      // The author is under the cap, the co-author is not.
      (db.scienceRecord.count as Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(2);
      expect(await saveRecord({ ...base, coauthors: [named(15000)] })).toEqual({
        error: 'Петренко Петро Петрович: не більше 2 записів цього виду роботи на рік',
      });
    });

    it('audits each share', async () => {
      planOf('plan-2');
      await saveRecord({ ...base, coauthors: [named(15000)] });
      const audited = (db.auditLog.create as Mock).mock.calls.map((c) => c[0].data);
      expect(audited.filter((a) => a.entity === 'ScienceRecord')).toHaveLength(2);
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
    createdById: 'other',
    template: { academicYear: '2026/2027' },
    createdBy: { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' },
    records: [{ staffId: 'other' }],
    coauthorShares: [] as { staffId: string }[],
  };

  /** The SAME article, entered in a рік that has since closed. A SHARED+ONCE
   *  key carries no year, so the lookup finds it — and nothing about it can be
   *  drawn now. */
  const lastYear = {
    ...existing,
    templateId: 't-2025',
    template: { academicYear: '2025/2026' },
  };

  it('returns a CONFLICT naming who has it — there is nothing to take, and it is not an error', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(existing);
    expect(await saveRecord(base)).toEqual({
      conflict: {
        workId: 'w1',
        createdByName: 'Іваненко І. І.',
        summary: expect.any(String),
        totalHundredths: 20000,
        fromYear: null,
      },
    });
    expect(db.scienceWork.create).not.toHaveBeenCalled();
    // Nobody adds themselves any more: no draw, no reservation.
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
  });

  it('tells the AUTHOR they already added it', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...existing,
      createdById: 'staff-1',
      records: [{ staffId: 'staff-1' }],
    });
    expect(await saveRecord(base)).toEqual({ error: 'Ви вже додали цю роботу' });
  });

  it('tells a person the author NAMED that they are already on it — «you added it» would be untrue', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...existing,
      records: [{ staffId: 'other' }, { staffId: 'staff-1' }],
    });
    expect(await saveRecord(base)).toEqual({
      error: 'Вас уже вказано співавтором цієї роботи — вона у вашому «Виконанні»',
    });
  });

  it('tells a person with only a RESERVATION what will happen when they save their plan', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...existing,
      coauthorShares: [{ staffId: 'staff-1' }],
    });
    expect(await saveRecord(base)).toEqual({
      error:
        'Вас уже вказано співавтором цієї роботи. Вона з’явиться у «Виконанні», щойно ви збережете план наукової роботи',
    });
  });

  it('NAMES the рік when the work belongs to a closed one', async () => {
    // Previously this offered «Приєднатися» over a closed рік's pool, and
    // `joinWork` then answered «Роботу не знайдено» (owner, 2026-09-20).
    (db.scienceWork.findUnique as Mock).mockResolvedValue(lastYear);
    expect(await saveRecord(base)).toMatchObject({
      conflict: { fromYear: '2025/2026', createdByName: 'Іваненко І. І.' },
    });
  });

  it('prefers the рік explanation over «Ви вже додали цю роботу»', async () => {
    // Their own draw, but from last рік: naming the рік answers what they
    // actually asked, where «вже додали» reads as if it meant this рік.
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...lastYear,
      records: [{ staffId: 'staff-1' }],
    });
    expect(await saveRecord(base)).toMatchObject({ conflict: { fromYear: '2025/2026' } });
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
    ).toEqual({
      error: 'Співавторам віддано 300 год — робота має коштувати більше, щоб вам щось залишилось',
    });
  });

  const SHARED_WORK = {
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
  const editTo = (credits: number) =>
    updateWorkEvidence({
      workId: 'w1',
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits },
      link: 'https://example.com/a',
    });

  it('moves the AUTHOR’s share to what the co-authors leave — down when the pool shrinks', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(SHARED_WORK);
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    await editTo(6); // 300 год pool − 200 held by co-authors
    expect(db.scienceRecord.updateMany).toHaveBeenCalledWith({
      where: { workId: 'w1', staffId: 'staff-1' },
      data: { hoursHundredths: 10000 },
    });
  });

  it('on a DECLINED work the co-authors’ switched-off records still hold their hours', async () => {
    // They come back together with the work, so an edit made while it is
    // declined must not hand their hours to the author.
    const declinedAt = new Date('2026-10-01T09:00:00Z');
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...SHARED_WORK, declinedAt });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    await editTo(6);
    expect((db.scienceRecord.aggregate as Mock).mock.calls[0][0].where).toEqual({
      workId: 'w1',
      staffId: { not: 'staff-1' },
      OR: [{ status: 'APPROVED' }, { removedAt: declinedAt }],
    });
    expect(db.scienceRecord.updateMany).toHaveBeenCalledWith({
      where: { workId: 'w1', staffId: 'staff-1' },
      data: { hoursHundredths: 10000 },
    });
  });

  it('…and UP when it grows — the co-authors were given fixed hours, so the rest is the author’s', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...SHARED_WORK,
      totalHundredths: 30000,
      evidence: { title: 'Стаття про освіту', option: 'scopus', credits: 6 },
    });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    await editTo(10); // 500 − 200 = 300
    expect(db.scienceRecord.updateMany).toHaveBeenCalledWith({
      where: { workId: 'w1', staffId: 'staff-1' },
      data: { hoursHundredths: 30000 },
    });
  });

  it('counts RESERVED hours as held — they belong to somebody just as much', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(SHARED_WORK);
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 10000 } });
    (db.scienceCoauthorShare.aggregate as Mock).mockResolvedValue({
      _sum: { hoursHundredths: 10000 },
    });
    await editTo(6);
    // 300 − (100 recorded + 100 reserved) = 100
    expect((db.scienceRecord.updateMany as Mock).mock.calls[0][0].data.hoursHundredths).toBe(10000);
  });

  it('refuses a pool that leaves the author NOTHING — held hours equal to the whole', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(SHARED_WORK);
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    (db.scienceCoauthorShare.aggregate as Mock).mockResolvedValue({
      _sum: { hoursHundredths: 10000 },
    });
    expect(await editTo(6)).toMatchObject({ error: expect.stringContaining('300') });
    expect(db.scienceWork.update).not.toHaveBeenCalled();
  });

  it('when an ADMIN edits, it is the AUTHOR’s row that moves — never the admin’s own', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...SHARED_WORK,
      createdById: 'author',
    });
    (db.scienceRecord.aggregate as Mock).mockResolvedValue({ _sum: { hoursHundredths: 20000 } });
    await editTo(6);
    expect((db.scienceRecord.updateMany as Mock).mock.calls[0][0].where.staffId).toBe('author');
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
      createdById: 'staff-1',
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
      createdById: 'staff-1',
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

  it('an AUTHOR withdrawing deletes the WHOLE WORK — co-authors and reservations go with it', async () => {
    // Owner, 2026-09-30. The co-authors hold hours the author gave them, the
    // author's proof stands behind the pool, and the work's dedupKey would block
    // the article from ever being entered again. The screen warns first.
    expect(await deleteRecord('r1')).toEqual({ ok: true });
    expect(db.scienceWork.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    // the cascade takes the records: no separate delete, no hours moved
    expect(db.scienceRecord.delete).not.toHaveBeenCalled();
    expect(db.scienceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('an INDIVIDUAL work goes with its owner’s record', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(INDIVIDUAL_RECORD);
    expect(await deleteRecord('r1')).toEqual({ ok: true });
    expect(db.scienceWork.delete).toHaveBeenCalledWith({ where: { id: 'w2' } });
  });

  it('clears the deleted work’s R2 objects AFTER the commit', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...RECORD,
      work: { ...RECORD.work, files: [{ objectKey: 'evidence/t1/gone.pdf' }] },
    });

    await deleteRecord('r1');
    expect(mockDropObject).toHaveBeenCalledWith('science.deleteRecord', 'evidence/t1/gone.pdf', {
      userId: 'u1',
      entityId: 'r1',
    });
  });

  it('a CO-AUTHOR withdrawing deletes only their own record and LEAVES the work standing', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...RECORD,
      work: { ...RECORD.work, createdById: 'author-1' },
    });
    expect(await deleteRecord('r1')).toEqual({ ok: true });
    expect(db.scienceRecord.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(db.scienceWork.delete).not.toHaveBeenCalled();
  });

  it('gives a withdrawing CO-AUTHOR’s hours BACK to the author — nobody else can take them any more', async () => {
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...RECORD,
      work: { ...RECORD.work, createdById: 'author-1' },
    });
    expect(await deleteRecord('r1')).toEqual({ ok: true });
    // No status filter: a declined work has the author's row switched off too,
    // and it comes back with these hours.
    expect(db.scienceRecord.updateMany).toHaveBeenCalledWith({
      where: { workId: 'w1', staffId: 'author-1' },
      data: { hoursHundredths: { increment: 5000 } },
    });
  });

  it('audits the withdrawal — the work when the author deleted it, the record for a co-author', async () => {
    await deleteRecord('r1');
    let entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry.action).toBe('DELETE');
    expect(entry.entity).toBe('ScienceWork');

    (db.auditLog.create as Mock).mockClear();
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({
      ...RECORD,
      work: { ...RECORD.work, createdById: 'author-1' },
    });
    await deleteRecord('r1');
    entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
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
});

describe('lockPlan — no saving below the norm (owner, 2026-09-24)', () => {
  // A full ставка (1,00 = 100 hundredths) owes 500 год = 50 000 hundredths.
  const open = (planned: number[]) =>
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({
      id: 'plan-1',
      lockedAt: null,
      rows: planned.map((plannedHundredths, i) => ({ id: `r${i}`, plannedHundredths })),
    });

  beforeEach(() => {
    (db.sciencePlan.updateMany as Mock).mockResolvedValue({ count: 1 });
  });

  it('refuses a plan below 500 × ставка, naming the shortfall', async () => {
    open([5000]); // 50 год
    expect(await lockPlan('d1')).toEqual({
      error: 'План нижче норми: заплановано 50 год з 500 потрібних. Додайте ще 450 год.',
    });
    expect(db.sciencePlan.updateMany).not.toHaveBeenCalled();
  });

  it('saves a plan exactly at the norm', async () => {
    open([30000, 20000]); // 300 + 200
    expect(await lockPlan('d1')).toEqual({ ok: true });
    expect(db.sciencePlan.updateMany).toHaveBeenCalled();
  });

  it('measures a part-time ставка pro rata — 0,25 owes 125 год', async () => {
    (db.stakeAllocation.findFirst as Mock).mockResolvedValue({ proposedHundredths: 25 });
    open([12500]);
    expect(await lockPlan('d1')).toEqual({ ok: true });
  });
});

describe('lockPlan — hours reserved for me become records (owner, 2026-09-30)', () => {
  const reservation = (over: object = {}) => ({
    id: 's1',
    hoursHundredths: 15000,
    work: {
      id: 'w9',
      templateId: 't1',
      workTypeId: 'wt1',
      totalHundredths: 50000,
      workType: { label: 'Наукова стаття', maxPerYear: null as number | null },
    },
    ...over,
  });

  beforeEach(() => {
    (db.sciencePlan.updateMany as Mock).mockResolvedValue({ count: 1 });
    (db.sciencePlan.findUnique as Mock).mockResolvedValue({
      id: 'plan-1',
      lockedAt: null,
      rows: [{ id: 'r0', plannedHundredths: 50000 }],
    });
  });

  it('turns a reservation into a record on the plan just saved, then drops it', async () => {
    (db.scienceCoauthorShare.findMany as Mock).mockResolvedValue([reservation()]);
    expect(await lockPlan('d1')).toEqual({ ok: true });
    expect(db.scienceRecord.create).toHaveBeenCalledWith({
      data: {
        staffId: 'staff-1',
        workId: 'w9',
        templateId: 't1',
        planId: 'plan-1',
        planRowId: null,
        hoursHundredths: 15000,
      },
      select: { id: true },
    });
    expect(db.scienceCoauthorShare.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('joins a work ННВ has DECLINED switched off, like everybody else on it', async () => {
    const declinedAt = new Date('2026-10-01T09:00:00Z');
    (db.scienceCoauthorShare.findMany as Mock).mockResolvedValue([
      reservation({
        work: {
          id: 'w9',
          templateId: 't1',
          workTypeId: 'wt1',
          totalHundredths: 50000,
          declinedAt,
          declineReason: 'Не вказано співавтора',
          declinedById: 'editor-1',
          workType: { label: 'Наукова стаття', maxPerYear: null as number | null },
        },
      }),
    ]);
    expect(await lockPlan('d1')).toEqual({ ok: true });
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data).toMatchObject({
      status: 'REMOVED',
      removedAt: declinedAt,
      removedReason: 'Не вказано співавтора',
      removedByUserId: 'editor-1',
    });
  });

  it('reads only THIS person’s reservations on works of THIS year', async () => {
    await lockPlan('d1');
    expect(db.scienceCoauthorShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { staffId: 'staff-1', work: { templateId: 't1' } } })
    );
  });

  it('leaves a reservation that would break the yearly cap where it is — it must not stop the plan being saved', async () => {
    (db.scienceCoauthorShare.findMany as Mock).mockResolvedValue([
      reservation({
        work: {
          id: 'w9',
          templateId: 't1',
          workTypeId: 'wt1',
          totalHundredths: 50000,
          workType: { label: 'Наукова стаття', maxPerYear: 1 },
        },
      }),
    ]);
    (db.scienceRecord.count as Mock).mockResolvedValue(1);
    expect(await lockPlan('d1')).toEqual({ ok: true });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
    expect(db.scienceCoauthorShare.delete).not.toHaveBeenCalled();
  });

  it('saves a plan with nothing reserved exactly as before', async () => {
    expect(await lockPlan('d1')).toEqual({ ok: true });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
  });
});

describe('updateCoauthors — the one way a share changes (owner, 2026-09-30)', () => {
  const WORK = {
    id: 'w1',
    templateId: 't1',
    totalHundredths: 50000,
    createdById: 'staff-1',
    workType: { id: 'wt1', label: 'Наукова стаття', sharing: 'SHARED', maxPerYear: null },
  };
  const OWN = { id: 'r-own', status: 'APPROVED', hoursHundredths: 50000 };
  const someone = { lastName: 'Іваненко', firstName: 'Іван', patronymic: 'Іванович' };
  const held = (id: string, staffId: string, hoursHundredths: number, status = 'APPROVED') => ({
    id,
    staffId,
    status,
    hoursHundredths,
    staff: someone,
  });
  const ownUpdates = () =>
    (db.scienceRecord.update as Mock).mock.calls.filter((c) => c[0].where.id === 'r-own');

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(WORK);
    // The author's own record — `setAuthorShare` reads it by (person, work).
    (db.scienceRecord.findUnique as Mock).mockResolvedValue(OWN);
    (db.scienceRecord.update as Mock).mockResolvedValue({ id: 'x' });
  });

  describe('while the work is DECLINED (owner, 2026-09-30)', () => {
    // Adding a valid co-author the author left out is often exactly what ННВ
    // declined it for — so it must be possible, without counting anybody early.
    const DECLINED_AT = new Date('2026-10-01T09:00:00Z');
    const DECLINED = {
      ...WORK,
      declinedAt: DECLINED_AT,
      declineReason: 'Не вказано співавтора',
      declinedById: 'editor-1',
    };
    const switchedOffByDecline = (id: string, staffId: string, hours: number) => ({
      ...held(id, staffId, hours, 'REMOVED'),
      removedAt: DECLINED_AT,
    });

    beforeEach(() => {
      (db.scienceWork.findUnique as Mock).mockResolvedValue(DECLINED);
    });

    it('adds a co-author SWITCHED OFF with the work’s own stamp — they count when it is sent back', async () => {
      (db.sciencePlan.findMany as Mock).mockResolvedValue([{ id: 'plan-2', departmentId: 'd1' }]);
      expect(
        await updateCoauthors({
          workId: 'w1',
          coauthors: [{ staffId: 'staff-2', hoursHundredths: 15000 }],
        })
      ).toEqual({ ok: true });
      expect((db.scienceRecord.create as Mock).mock.calls[0][0].data).toMatchObject({
        staffId: 'staff-2',
        hoursHundredths: 15000,
        status: 'REMOVED',
        removedAt: DECLINED_AT,
        removedReason: 'Не вказано співавтора',
        removedByUserId: 'editor-1',
      });
    });

    it('changes the hours of a co-author the decline switched off — and the author’s own row follows', async () => {
      (db.scienceRecord.findMany as Mock).mockResolvedValue([
        switchedOffByDecline('r2', 'staff-2', 15000),
      ]);
      (db.scienceRecord.findUnique as Mock).mockResolvedValue({
        ...OWN,
        status: 'REMOVED',
        removedAt: DECLINED_AT,
        hoursHundredths: 35000,
      });
      expect(
        await updateCoauthors({
          workId: 'w1',
          coauthors: [{ staffId: 'staff-2', hoursHundredths: 20000 }],
        })
      ).toEqual({ ok: true });
      expect(db.scienceRecord.update).toHaveBeenCalledWith({
        where: { id: 'r2' },
        data: { hoursHundredths: 20000 },
      });
      expect(ownUpdates()[0][0].data).toEqual({ hoursHundredths: 30000 });
    });

    it('removes one the decline switched off, when the author leaves them out', async () => {
      (db.scienceRecord.findMany as Mock).mockResolvedValue([
        switchedOffByDecline('r2', 'staff-2', 15000),
      ]);
      (db.scienceRecord.findUnique as Mock).mockResolvedValue({
        ...OWN,
        status: 'REMOVED',
        removedAt: DECLINED_AT,
        hoursHundredths: 35000,
      });
      await updateCoauthors({ workId: 'w1', coauthors: [] });
      expect(db.scienceRecord.delete).toHaveBeenCalledWith({ where: { id: 'r2' } });
    });

    it('still refuses to re-add somebody declined on their own, earlier', async () => {
      (db.scienceRecord.findMany as Mock).mockResolvedValue([
        { ...held('r3', 'staff-3', 5000, 'REMOVED'), removedAt: new Date('2026-09-01T00:00:00Z') },
      ]);
      const result = await updateCoauthors({
        workId: 'w1',
        coauthors: [{ staffId: 'staff-3', hoursHundredths: 5000 }],
      });
      expect(result).toMatchObject({ error: expect.stringContaining('запис відхилено ННВ') });
    });
  });

  it('adds a co-author who has a saved plan as a record, and moves the author to what is left', async () => {
    (db.sciencePlan.findMany as Mock).mockResolvedValue([{ id: 'plan-2', departmentId: 'd1' }]);
    expect(
      await updateCoauthors({
        workId: 'w1',
        coauthors: [{ staffId: 'staff-2', hoursHundredths: 15000 }],
      })
    ).toEqual({ ok: true });
    expect((db.scienceRecord.create as Mock).mock.calls[0][0].data).toMatchObject({
      staffId: 'staff-2',
      planId: 'plan-2',
      hoursHundredths: 15000,
    });
    expect(ownUpdates()[0][0].data).toEqual({ hoursHundredths: 35000 });
  });

  it('reserves the hours of one who has not saved a plan', async () => {
    await updateCoauthors({
      workId: 'w1',
      coauthors: [{ staffId: 'staff-2', hoursHundredths: 15000 }],
    });
    expect(db.scienceRecord.create).not.toHaveBeenCalled();
    expect(db.scienceCoauthorShare.create).toHaveBeenCalledWith({
      data: { workId: 'w1', staffId: 'staff-2', hoursHundredths: 15000 },
      select: { id: true },
    });
    expect(ownUpdates()[0][0].data).toEqual({ hoursHundredths: 35000 });
  });

  it('changes an existing co-author’s hours', async () => {
    (db.scienceRecord.findMany as Mock).mockResolvedValue([held('r2', 'staff-2', 15000)]);
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...OWN, hoursHundredths: 35000 });
    await updateCoauthors({
      workId: 'w1',
      coauthors: [{ staffId: 'staff-2', hoursHundredths: 20000 }],
    });
    expect(db.scienceRecord.update).toHaveBeenCalledWith({
      where: { id: 'r2' },
      data: { hoursHundredths: 20000 },
    });
    expect(ownUpdates()[0][0].data).toEqual({ hoursHundredths: 30000 });
  });

  it('leaves a share alone when nothing about it changed', async () => {
    (db.scienceRecord.findMany as Mock).mockResolvedValue([held('r2', 'staff-2', 15000)]);
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...OWN, hoursHundredths: 35000 });
    await updateCoauthors({
      workId: 'w1',
      coauthors: [{ staffId: 'staff-2', hoursHundredths: 15000 }],
    });
    expect(db.scienceRecord.update).not.toHaveBeenCalled();
  });

  it('removes a co-author who is no longer listed — and the hours go back to the author', async () => {
    (db.scienceRecord.findMany as Mock).mockResolvedValue([held('r2', 'staff-2', 15000)]);
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...OWN, hoursHundredths: 35000 });
    await updateCoauthors({ workId: 'w1', coauthors: [] });
    expect(db.scienceRecord.delete).toHaveBeenCalledWith({ where: { id: 'r2' } });
    expect(ownUpdates()[0][0].data).toEqual({ hoursHundredths: 50000 });
  });

  it('removes and changes RESERVATIONS the same way', async () => {
    (db.scienceCoauthorShare.findMany as Mock).mockResolvedValue([
      { id: 's1', staffId: 'staff-2', hoursHundredths: 15000, staff: someone },
      { id: 's2', staffId: 'staff-3', hoursHundredths: 5000, staff: someone },
    ]);
    await updateCoauthors({
      workId: 'w1',
      coauthors: [{ staffId: 'staff-2', hoursHundredths: 20000 }],
    });
    expect(db.scienceCoauthorShare.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { hoursHundredths: 20000 },
    });
    expect(db.scienceCoauthorShare.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
  });

  it('will not name again somebody whose record ННВ declined — it would undo the moderator', async () => {
    (db.scienceRecord.findMany as Mock).mockResolvedValue([
      held('r2', 'staff-2', 15000, 'REMOVED'),
    ]);
    expect(
      await updateCoauthors({
        workId: 'w1',
        coauthors: [{ staffId: 'staff-2', hoursHundredths: 15000 }],
      })
    ).toEqual({
      error: 'Іваненко Іван Іванович: запис відхилено ННВ — додати цю людину знову не можна',
    });
  });

  it('leaves a declined record alone when its person is not listed', async () => {
    (db.scienceRecord.findMany as Mock).mockResolvedValue([
      held('r2', 'staff-2', 15000, 'REMOVED'),
    ]);
    await updateCoauthors({ workId: 'w1', coauthors: [] });
    expect(db.scienceRecord.delete).not.toHaveBeenCalled();
  });

  it('refuses a split that leaves the author nothing', async () => {
    expect(
      await updateCoauthors({
        workId: 'w1',
        coauthors: [{ staffId: 'staff-2', hoursHundredths: 50000 }],
      })
    ).toMatchObject({ error: expect.stringContaining('вам має залишитися') });
    expect(db.scienceCoauthorShare.create).not.toHaveBeenCalled();
  });

  it('is for the AUTHOR only — a named co-author cannot rewrite the split', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'someone-else' });
    expect(await updateCoauthors({ workId: 'w1', coauthors: [] })).toEqual({
      error: 'Змінювати співавторів може лише той, хто додав роботу',
    });
  });

  it('lets ADMIN in, even one who is not an НПП', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u9', staffId: 'staff-9', role: 'ADMIN' } });
    (db.staff.findUnique as Mock).mockResolvedValue({ ...STAFF, isNpp: false });
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, createdById: 'someone-else' });
    expect(await updateCoauthors({ workId: 'w1', coauthors: [] })).toEqual({ ok: true });
  });

  it('refuses an INDIVIDUAL work', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...WORK,
      workType: { ...WORK.workType, sharing: 'INDIVIDUAL' },
    });
    expect(await updateCoauthors({ workId: 'w1', coauthors: [] })).toEqual({
      error: 'У цієї роботи не може бути співавторів',
    });
  });

  it('refuses a work of another year', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...WORK, templateId: 'old' });
    expect(await updateCoauthors({ workId: 'w1', coauthors: [] })).toEqual({
      error: 'Роботу не знайдено',
    });
  });

  it('refuses malformed input', async () => {
    expect(await updateCoauthors({ workId: 'w1', coauthors: [{ staffId: 5 } as never] })).toEqual({
      error: 'Невірні дані співавторів',
    });
  });

  it('audits every change', async () => {
    (db.scienceRecord.findMany as Mock).mockResolvedValue([held('r2', 'staff-2', 15000)]);
    (db.scienceRecord.findUnique as Mock).mockResolvedValue({ ...OWN, hoursHundredths: 35000 });
    await updateCoauthors({ workId: 'w1', coauthors: [] });
    const actions = (db.auditLog.create as Mock).mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(['DELETE', 'UPDATE']);
  });
});

describe('resubmitScienceWork — the author sends a declined work back (owner, 2026-09-30)', () => {
  const DECLINED_AT = new Date('2026-10-01T09:00:00Z');
  const DECLINED_WORK = {
    id: 'w1',
    templateId: 't1',
    createdById: 'staff-1',
    declinedAt: DECLINED_AT,
    link: 'https://doi.org/10.31392/fixed',
    workType: { label: 'Наукова стаття', linkRule: 'REQUIRED', fileRule: 'NONE' },
    _count: { files: 0 },
  };

  beforeEach(() => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue(DECLINED_WORK);
  });

  it('brings back every record the decline switched off — and only those', async () => {
    expect(await resubmitScienceWork('w1')).toEqual({ ok: true });
    expect(db.scienceRecord.updateMany).toHaveBeenCalledWith({
      where: { workId: 'w1', status: 'REMOVED', removedAt: DECLINED_AT },
      data: { status: 'APPROVED', removedByUserId: null, removedAt: null, removedReason: null },
    });
  });

  it('clears the decline and stamps «виправлено» for ННВ', async () => {
    await resubmitScienceWork('w1');
    const data = (db.scienceWork.update as Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ declinedAt: null, declineReason: null, declinedById: null });
    expect(data.resubmittedAt).toBeInstanceOf(Date);
  });

  it('audits it', async () => {
    await resubmitScienceWork('w1');
    const entry = (db.auditLog.create as Mock).mock.calls[0][0].data;
    expect(entry).toMatchObject({ action: 'UPDATE', entity: 'ScienceWork', entityId: 'w1' });
  });

  it('refuses a co-author — only the author (or ADMIN) sends it back', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({
      ...DECLINED_WORK,
      createdById: 'author-1',
    });
    expect(await resubmitScienceWork('w1')).toEqual({
      error: 'Надіслати роботу повторно може лише той, хто її додав',
    });
    expect(db.scienceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a work that is not declined', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...DECLINED_WORK, declinedAt: null });
    expect(await resubmitScienceWork('w1')).toEqual({ error: 'Цю роботу не відхилено' });
  });

  it('refuses while the proof is still missing — the button cannot bring back a work with nothing behind it', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...DECLINED_WORK, link: null });
    expect(await resubmitScienceWork('w1')).toEqual({
      error: 'Для цього виду роботи потрібне посилання',
    });
    expect(db.scienceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a work of another year', async () => {
    (db.scienceWork.findUnique as Mock).mockResolvedValue({ ...DECLINED_WORK, templateId: 'old' });
    expect(await resubmitScienceWork('w1')).toEqual({ error: 'Роботу не знайдено' });
  });
});
