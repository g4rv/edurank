import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/scope', () => ({ scopeOf: vi.fn() }));
vi.mock('@/lib/queries/get-kharakterystyka', () => ({ getKharakterystykaMany: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    department: { findUnique: vi.fn() },
    departmentStake: { findUnique: vi.fn() },
    staff: { findMany: vi.fn(), findUnique: vi.fn() },
    staffStakeLimits: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scopeOf } from '@/lib/queries/scope';
import { getKharakterystykaMany } from '@/lib/queries/get-kharakterystyka';
import { saveDistribution, setStaffLimits } from './actions';

const mockAuth = auth as unknown as Mock;
const mockScope = scopeOf as unknown as Mock;
const mockDocs = getKharakterystykaMany as unknown as Mock;
const mockDepartment = db.department.findUnique as unknown as Mock;
const mockStake = db.departmentStake.findUnique as unknown as Mock;
const mockStaff = db.staff.findMany as unknown as Mock;
const mockStaffOne = db.staff.findUnique as unknown as Mock;
const mockLimitsFind = db.staffStakeLimits.findUnique as unknown as Mock;
const mockLimitsUpsert = db.staffStakeLimits.upsert as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const DEPT = 'dept-1';
const YEAR = 2026;

/** Three people, 1000 points each, on default limits (0.10 – 1.50) */
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
  mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', staffId: 'u1' } });
  mockScope.mockResolvedValue([]);
  mockDocs.mockResolvedValue(new Map());
  mockDepartment.mockResolvedValue({ name: 'Кафедра фізики' });
  mockStake.mockResolvedValue({ kstHundredths: 300 }); // 3.00
  mockStaff.mockResolvedValue(roster());
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

describe('saveDistribution — who may', () => {
  it('lets ADMIN save any кафедра', async () => {
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ success: true });
  });

  it('lets the кафедра’s own head save', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'h1', role: 'USER', staffId: 'h1' } });
    mockScope.mockResolvedValue([DEPT]);
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ success: true });
  });

  it('refuses a head from a different кафедра', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'h2', role: 'USER', staffId: 'h2' } });
    mockScope.mockResolvedValue(['other-dept']);
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses an EDITOR — reading a rating is not deciding pay', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } });
    mockScope.mockResolvedValue([]);
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses an ordinary НПП', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'n1', role: 'USER', staffId: 'n1' } });
    mockScope.mockResolvedValue([]);
    expect(await saveDistribution(payload([100, 100, 100]))).toEqual({ error: 'Недостатньо прав' });
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
    mockAuth.mockResolvedValue({ user: { id: 'h1', role: 'USER', staffId: 'h1' } });
    mockScope.mockResolvedValue([DEPT]);
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
