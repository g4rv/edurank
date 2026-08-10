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

/**
 * With Кнпп = 0 in these mocks the formula is uncomputable and proposes the
 * 0.10 floor for everyone, so most values here count as a departure from it.
 * A justification is therefore supplied by default — the tests that care about
 * the justification rule build their payload explicitly instead.
 */
function payload(values: number[], departmentId = DEPT) {
  return {
    departmentId,
    year: YEAR,
    allocations: values.map((hundredths, i) => ({
      staffId: `s${i}`,
      hundredths,
      justification: 'обґрунтування',
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

  it('REFUSES one that overspends, by any amount', async () => {
    const result = await saveDistribution(payload([100, 100, 105]));
    expect(result).toMatchObject({ error: expect.stringContaining('Перевищення') });
  });

  it('says how much the overspend is', async () => {
    const result = await saveDistribution(payload([150, 150, 150]));
    // 4.50 against a 3.00 pool — over by 1.50
    expect(result).toMatchObject({ error: expect.stringContaining('1,50') });
  });

  it('refuses when no Кст has been set at all', async () => {
    mockStake.mockResolvedValue(null);
    const result = await saveDistribution(payload([100, 100, 100]));
    expect(result).toMatchObject({ error: expect.stringContaining('Кст') });
  });
});

describe('saveDistribution — обґрунтування', () => {
  // 3 people, 1000 each, Кст 3.00, Кнпп 0 (no Характеристика data in these
  // mocks) — so the formula is uncomputable and every share is the 0.10 floor.
  const unexplained = (values: number[]) => ({
    departmentId: DEPT,
    year: YEAR,
    allocations: values.map((hundredths, i) => ({
      staffId: `s${i}`,
      hundredths,
      justification: null,
    })),
  });

  it('refuses a departure from the formula with no reason given', async () => {
    const result = await saveDistribution(unexplained([100, 10, 10]));
    expect(result).toMatchObject({ error: expect.stringContaining('обґрунтування') });
  });

  it('names who is missing one', async () => {
    const result = await saveDistribution(unexplained([100, 10, 10]));
    expect(result).toMatchObject({ error: expect.stringContaining('Прізвище0') });
  });

  it('accepts the same departure once it is explained', async () => {
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

  it('asks for nothing on a row that matches the formula', async () => {
    // All three on the floor, which is what the formula gives here
    expect(await saveDistribution(unexplained([10, 10, 10]))).toEqual({ success: true });
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
