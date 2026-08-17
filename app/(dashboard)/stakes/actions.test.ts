import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/scope', () => ({ scopeOf: vi.fn(), headOf: vi.fn() }));
vi.mock('@/lib/queries/get-kharakterystyka', () => ({ getKharakterystykaMany: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    department: { findUnique: vi.fn() },
    departmentStake: { findUnique: vi.fn() },
    staff: { findMany: vi.fn(), findUnique: vi.fn() },
    staffStakeLimits: { findUnique: vi.fn(), upsert: vi.fn() },
    stakeSandbox: { upsert: vi.fn(), deleteMany: vi.fn() },
    ratingTemplate: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { getKharakterystykaMany } from '@/lib/queries/get-kharakterystyka';
import {
  resetSandbox,
  saveDistribution,
  saveSandbox,
  setSandboxKst,
  setStaffLimits,
} from './actions';

const mockAuth = auth as unknown as Mock;
const mockScope = scopeOf as unknown as Mock;
const mockHeadOf = headOf as unknown as Mock;
const mockDocs = getKharakterystykaMany as unknown as Mock;
const mockDepartment = db.department.findUnique as unknown as Mock;
const mockStake = db.departmentStake.findUnique as unknown as Mock;
const mockStaff = db.staff.findMany as unknown as Mock;
/** What `activeYear()` reads — every real ставка write is pinned to it */
const mockTemplate = db.ratingTemplate.findFirst as unknown as Mock;
const mockStaffOne = db.staff.findUnique as unknown as Mock;
const mockLimitsFind = db.staffStakeLimits.findUnique as unknown as Mock;
const mockLimitsUpsert = db.staffStakeLimits.upsert as unknown as Mock;
const mockSandboxUpsert = db.stakeSandbox.upsert as unknown as Mock;
const mockSandboxDelete = db.stakeSandbox.deleteMany as unknown as Mock;
const mockAudit = db.auditLog.create as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const DEPT = 'dept-1';
const YEAR = 2026;

const ADMIN = { user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } };
const HEAD = { user: { id: 'h1', role: 'USER', staffId: 'h1' } };

/** Three people, 1000 points each, on default limits (0.10 – 1.00) */
function roster(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    lastName: `Прізвище${i}`,
    firstName: 'Ім’я',
    ratingEntries: [{ totalScore: 1000 }],
    stakeLimits: [],
  }));
}

/** A plain payload; the justification is optional and defaulted to null. */
function payload(values: number[], departmentId = DEPT) {
  return {
    departmentId,
    year: YEAR,
    allocations: values.map((hundredths, i) => ({
      staffId: `s${i}`,
      hundredths,
      justification: null,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The head is the default caller now: ADMIN cannot save a distribution at all.
  mockAuth.mockResolvedValue(HEAD);
  mockScope.mockResolvedValue([DEPT]);
  mockHeadOf.mockResolvedValue([DEPT]);
  mockDocs.mockResolvedValue(new Map());
  mockDepartment.mockResolvedValue({ id: DEPT, name: 'Кафедра фізики' });
  mockStake.mockResolvedValue({ kstHundredths: 300 }); // 3.00
  mockStaff.mockResolvedValue(roster());
  mockTemplate.mockResolvedValue({ year: YEAR });
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      stakeDistribution: { upsert: vi.fn().mockResolvedValue({ id: 'dist-1' }) },
      stakeAllocation: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    })
  );
});

// The `year` in the payload used to be written against without ever being
// checked, so a request made outside the UI could name a year that was closed
// and reported and rewrite a кафедра's pay for it — with an audit entry that
// looked perfectly ordinary. Both writes are now pinned to the active template.
describe('the year is pinned to the active template', () => {
  it('refuses a distribution for a year that is not the active one', async () => {
    mockTemplate.mockResolvedValue({ year: 2025 });

    const result = await saveDistribution(payload([100, 100, 100]));

    expect(result).toEqual({ error: expect.stringContaining('2025') });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses per-person limits for a year that is not the active one', async () => {
    mockAuth.mockResolvedValue(ADMIN);
    mockTemplate.mockResolvedValue({ year: 2025 });

    const fd = new FormData();
    fd.set('staffId', 's1');
    fd.set('year', String(YEAR));
    fd.set('min', '0,10');
    fd.set('max', '1,00');

    expect(await setStaffLimits(null, fd)).toHaveProperty('error');
    expect(mockLimitsUpsert).not.toHaveBeenCalled();
  });

  it('refuses a distribution when no template is active at all', async () => {
    mockTemplate.mockResolvedValue(null);

    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({
      error: 'Рейтинговий рік ще не налаштовано',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('saveDistribution — who may', () => {
  it('lets the кафедра’s own head save', async () => {
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ success: true });
  });

  // The rule the sandbox exists for. ADMIN owns Кст and the caps but must never
  // write a кафедра's split — otherwise «завідувач розподіляє» is not true.
  // Provisional (2026-08-13): ADMIN was locked out of the real split on
  // 2026-08-12 and let back in while the owner decides. The one thing that must
  // stay true either way is that the write is recorded against whoever made it,
  // which `filledById` and the audit entry already do.
  it('lets ADMIN save a кафедра they do not head', async () => {
    mockAuth.mockResolvedValue(ADMIN);
    mockScope.mockResolvedValue([]);
    mockHeadOf.mockResolvedValue([]);
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ success: true });
  });

  // A декан sees every кафедра of their faculty — `scopeOf` says so, and that
  // is what the page uses to let them read one. Deciding the split is still
  // the завідувач's, so the ACTION asks `headOf` instead (2026-08-13).
  it('refuses a декан on a кафедра of their faculty they do not lead', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'dean', role: 'USER', staffId: 'dean' } });
    mockScope.mockResolvedValue([DEPT, 'other-dept']);
    mockHeadOf.mockResolvedValue([]);
    const result = await saveDistribution(payload([100, 100, 100]));
    expect(result).toMatchObject({ error: expect.stringContaining('завідувач') });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('still lets a декан save the кафедра they DO lead', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'dean', role: 'USER', staffId: 'dean' } });
    mockScope.mockResolvedValue([DEPT, 'other-dept']);
    mockHeadOf.mockResolvedValue([DEPT]);
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ success: true });
  });

  it('refuses a head from a different кафедра', async () => {
    mockHeadOf.mockResolvedValue(['other-dept']);
    expect(await saveDistribution(payload([100, 100, 100]))).toMatchObject({
      error: expect.stringContaining('завідувач'),
    });
  });

  it('refuses an EDITOR — reading a rating is not deciding pay', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } });
    mockHeadOf.mockResolvedValue([]);
    expect(await saveDistribution(payload([100, 100, 100]))).toMatchObject({
      error: expect.stringContaining('завідувач'),
    });
  });

  it('refuses an ordinary НПП', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'n1', role: 'USER', staffId: 'n1' } });
    mockHeadOf.mockResolvedValue([]);
    expect(await saveDistribution(payload([100, 100, 100]))).toMatchObject({
      error: expect.stringContaining('завідувач'),
    });
  });
});

describe('saveDistribution — the pool ceiling', () => {
  it('accepts a distribution that exactly spends the pool', async () => {
    // 3.00 pool, 1.00 each
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ success: true });
  });

  it('accepts one that leaves some undistributed', async () => {
    expect(await saveDistribution(payload([100, 100, 50]))).toEqual({ success: true });
  });

  // Caps raised out of the way on purpose: the default is one full ставка, so
  // without this the per-person cap refuses these values first and the pool
  // rule under test never runs.
  function uncapped() {
    const staff = roster();
    for (const s of staff) s.stakeLimits = [{ minHundredths: 10, maxHundredths: 150 }] as never;
    mockStaff.mockResolvedValue(staff);
  }

  // Overspending is the кафедра's decision to make and the протокол's to
  // record, so the save takes it. It used to be refused, which deadlocked with
  // «тільки збільшити»: nothing could be raised and nothing could be lowered.
  it('ACCEPTS one that overspends by a rounding hundredth', async () => {
    uncapped();
    expect(await saveDistribution(payload([100, 100, 105]))).toEqual({ success: true });
  });

  it('accepts a large overspend too — the протокол settles it, not the form', async () => {
    uncapped();
    // 4.50 against a 3.00 pool
    expect(await saveDistribution(payload([150, 150, 150]))).toEqual({ success: true });
  });

  it('refuses when no Кст has been set at all', async () => {
    mockStake.mockResolvedValue(null);
    const result = await saveDistribution(payload([100, 100, 100]));
    expect(result).toMatchObject({ error: expect.stringContaining('Кст') });
  });
});

describe('saveDistribution — обґрунтування is optional', () => {
  // Додаток 2 has the column and the положення says the head justifies a
  // deviation, but nothing establishes that the APP must refuse a save without
  // one. It does not, and these pin that down so it is not quietly tightened.
  const unexplained = (values: number[]) => ({
    departmentId: DEPT,
    year: YEAR,
    allocations: values.map((hundredths, i) => ({
      staffId: `s${i}`,
      hundredths,
      justification: null,
    })),
  });

  it('saves a departure from the formula with no reason given', async () => {
    expect(await saveDistribution(unexplained([100, 10, 10]))).toEqual({ success: true });
  });

  it('saves a row that matches the formula, also with no reason', async () => {
    expect(await saveDistribution(unexplained([10, 10, 10]))).toEqual({ success: true });
  });

  it('keeps a reason when one is given', async () => {
    const result = await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: 'гарант освітньої програми' },
        { staffId: 's1', hundredths: 10, justification: null },
        { staffId: 's2', hundredths: 10, justification: null },
      ],
    });
    expect(result).toEqual({ success: true });
  });
});

describe('saveDistribution — per-person rules', () => {
  it('refuses a value below the floor', async () => {
    const result = await saveDistribution(payload([100, 100, 5]));
    expect(result).toMatchObject({ error: expect.stringContaining('0,10') });
  });

  it('refuses zero — nobody may end on nothing', async () => {
    const result = await saveDistribution(payload([100, 100, 0]));
    expect(result).toHaveProperty('error');
  });

  it('refuses a value above the person’s cap', async () => {
    const staff = roster();
    staff[0].stakeLimits = [{ minHundredths: 10, maxHundredths: 50 }] as never;
    mockStaff.mockResolvedValue(staff);
    const result = await saveDistribution(payload([55, 100, 100]));
    expect(result).toMatchObject({ error: expect.stringContaining('0,50') });
  });

  it('refuses a value off the 0.05 ladder', async () => {
    const result = await saveDistribution(payload([100, 100, 63]));
    expect(result).toMatchObject({ error: expect.stringContaining('0,05') });
  });

  it('refuses a roster that has changed under the head', async () => {
    // Somebody joined or was archived while the grid was open
    const result = await saveDistribution(payload([100, 100]));
    expect(result).toMatchObject({ error: expect.stringContaining('змінився') });
  });

  it('refuses an allocation for somebody not on the кафедра', async () => {
    const result = await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: null },
        { staffId: 's1', hundredths: 100, justification: null },
        { staffId: 'stranger', hundredths: 100, justification: null },
      ],
    });
    expect(result).toMatchObject({ error: expect.stringContaining('змінився') });
  });

  it('refuses a malformed payload outright', async () => {
    expect(await saveDistribution({ nonsense: true })).toEqual({ error: 'Невірні дані форми' });
  });
});

describe('setStaffLimits — ADMIN only', () => {
  function limitsForm(min: string, max: string) {
    const fd = new FormData();
    fd.set('staffId', 's0');
    fd.set('year', String(YEAR));
    fd.set('min', min);
    fd.set('max', max);
    return fd;
  }

  beforeEach(() => {
    mockAuth.mockResolvedValue(ADMIN);
    mockStaffOne.mockResolvedValue({
      lastName: 'Прізвище',
      firstName: 'Ім’я',
      patronymic: 'По батькові',
      departmentId: DEPT,
    });
    mockLimitsFind.mockResolvedValue(null);
    mockLimitsUpsert.mockResolvedValue({ id: 'lim-1' });
  });

  it('lets ADMIN set them', async () => {
    expect(await setStaffLimits(null, limitsForm('0,25', '1,00'))).toEqual({ success: true });
  });

  it('refuses a head — this is exactly the escalation the caps prevent', async () => {
    mockAuth.mockResolvedValue(HEAD);
    mockHeadOf.mockResolvedValue([DEPT]);
    const result = await setStaffLimits(null, limitsForm('0,10', '1,50'));
    // A head who could drop a colleague's cap and raise their own would make
    // the caps meaningless
    expect(result).toMatchObject({ error: expect.stringContaining('адміністратор') });
    expect(mockLimitsUpsert).not.toHaveBeenCalled();
  });

  it('refuses a floor below 0.10', async () => {
    const result = await setStaffLimits(null, limitsForm('0', '1,50'));
    expect(result).toHaveProperty('error');
    expect(mockLimitsUpsert).not.toHaveBeenCalled();
  });

  it('refuses a ceiling below the floor', async () => {
    const result = await setStaffLimits(null, limitsForm('1,00', '0,50'));
    expect(result).toHaveProperty('error');
  });
});

// The guarantee the whole sandbox rests on: it writes its own table and nothing
// else. Not «can but shouldn't» — there is no path from here to a real ставка.
describe('the sandbox writes nothing real', () => {
  const sandbox = {
    departmentId: DEPT,
    year: YEAR,
    values: { s0: 100, s1: 50, s2: 25 },
    limits: { s0: { min: 10, max: 200 } },
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue(ADMIN);
    mockSandboxUpsert.mockResolvedValue({ id: 'sb-1' });
  });

  it('saves ADMIN’s numbers to StakeSandbox alone', async () => {
    expect(await saveSandbox(sandbox)).toEqual({ success: true });
    expect(mockSandboxUpsert).toHaveBeenCalledTimes(1);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockLimitsUpsert).not.toHaveBeenCalled();
  });

  // It is a scratch pad, not a decision — an audit line would make it look like
  // one, and 40 кафедри of experimenting would bury the real entries.
  it('writes no audit entry', async () => {
    await saveSandbox(sandbox);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  // The sandbox stays ADMIN's alone even now that ADMIN may write the real
  // split: a head has one кафедра and one real answer to give.
  it('is refused to a head, however much of a head they are', async () => {
    mockAuth.mockResolvedValue(HEAD);
    mockHeadOf.mockResolvedValue([DEPT]);
    const result = await saveSandbox(sandbox);
    expect(result).toMatchObject({ error: expect.stringContaining('адміністратор') });
    expect(mockSandboxUpsert).not.toHaveBeenCalled();
  });

  it('is refused to an EDITOR', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } });
    expect(await saveSandbox(sandbox)).toHaveProperty('error');
    expect(mockSandboxUpsert).not.toHaveBeenCalled();
  });

  it('refuses a floor under 0,10 even in a sandbox', async () => {
    const result = await saveSandbox({ ...sandbox, limits: { s0: { min: 5, max: 200 } } });
    expect(result).toMatchObject({ error: expect.stringContaining('0,10') });
    expect(mockSandboxUpsert).not.toHaveBeenCalled();
  });

  it('refuses a ceiling under the floor', async () => {
    const result = await saveSandbox({ ...sandbox, limits: { s0: { min: 100, max: 50 } } });
    expect(result).toHaveProperty('error');
  });

  it('refuses a кафедра that does not exist', async () => {
    mockDepartment.mockResolvedValue(null);
    expect(await saveSandbox(sandbox)).toMatchObject({ error: 'Кафедру не знайдено' });
  });
});

describe('setSandboxKst', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(ADMIN);
    mockSandboxUpsert.mockResolvedValue({ id: 'sb-1' });
  });

  it('stores the pool being tried without touching DepartmentStake', async () => {
    expect(await setSandboxKst({ departmentId: DEPT, year: YEAR, kstHundredths: 600 })).toEqual({
      success: true,
    });
    expect(mockSandboxUpsert).toHaveBeenCalledTimes(1);
  });

  it('takes null — that is how ADMIN puts the real Кст back', async () => {
    expect(await setSandboxKst({ departmentId: DEPT, year: YEAR, kstHundredths: null })).toEqual({
      success: true,
    });
  });

  // A sandbox exists to show what a pool that is too small would do; refusing
  // to model it would hide the answer somebody opened the page for.
  it('accepts a pool below 0,10 × headcount, unlike the real one', async () => {
    expect(await setSandboxKst({ departmentId: DEPT, year: YEAR, kstHundredths: 5 })).toEqual({
      success: true,
    });
  });

  it('is refused to a head', async () => {
    mockAuth.mockResolvedValue(HEAD);
    expect(
      await setSandboxKst({ departmentId: DEPT, year: YEAR, kstHundredths: 600 })
    ).toHaveProperty('error');
    expect(mockSandboxUpsert).not.toHaveBeenCalled();
  });
});

describe('resetSandbox', () => {
  it('deletes only this admin’s row for this кафедра and year', async () => {
    mockAuth.mockResolvedValue(ADMIN);
    expect(await resetSandbox({ departmentId: DEPT, year: YEAR })).toEqual({ success: true });
    expect(mockSandboxDelete).toHaveBeenCalledWith({
      where: { userId: 'a1', departmentId: DEPT, year: YEAR },
    });
  });

  it('is refused to a head', async () => {
    mockAuth.mockResolvedValue(HEAD);
    expect(await resetSandbox({ departmentId: DEPT, year: YEAR })).toHaveProperty('error');
    expect(mockSandboxDelete).not.toHaveBeenCalled();
  });
});
