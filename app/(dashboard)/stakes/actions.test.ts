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
    stakeDistribution: { findUnique: vi.fn() },
    stakeAllocation: { update: vi.fn() },
    ratingTemplate: { findFirst: vi.fn(), findMany: vi.fn() },
    ratingEntry: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { getKharakterystykaMany } from '@/lib/queries/get-kharakterystyka';
import { saveDistribution, setStaffLimits } from './actions';

const mockAuth = auth as unknown as Mock;
const mockScope = scopeOf as unknown as Mock;
const mockHeadOf = headOf as unknown as Mock;
const mockDocs = getKharakterystykaMany as unknown as Mock;
const mockDepartment = db.department.findUnique as unknown as Mock;
const mockStake = db.departmentStake.findUnique as unknown as Mock;
const mockStaff = db.staff.findMany as unknown as Mock;
/** What `activeYear()` reads — every real ставка write is pinned to it */
const mockTemplate = db.ratingTemplate.findFirst as unknown as Mock;
/** ratingYearFor(): no earlier template, so the ставка year ranks on itself */
const mockEarlierTemplates = db.ratingTemplate.findMany as unknown as Mock;
const mockScoredYears = db.ratingEntry.findMany as unknown as Mock;
const mockStaffOne = db.staff.findUnique as unknown as Mock;
const mockLimitsFind = db.staffStakeLimits.findUnique as unknown as Mock;
const mockLimitsUpsert = db.staffStakeLimits.upsert as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockDistributionFind = db.stakeDistribution.findUnique as unknown as Mock;
const mockAllocationUpdate = db.stakeAllocation.update as unknown as Mock;
const mockAuditCreate = db.auditLog.create as unknown as Mock;

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

/**
 * Ratings 1500 / 1000 / 500 against a 3,00 pool, so the формула proposes
 * 1,00 / 1,00 / 0,75 and the third row has room to be raised. With an even
 * roster every share lands exactly on the 1,00 cap, and «тільки збільшити»
 * then leaves no legal move to test with.
 */
function uneven() {
  const staff = roster();
  staff[0].ratingEntries = [{ totalScore: 1500 }];
  staff[2].ratingEntries = [{ totalScore: 500 }];
  mockStaff.mockResolvedValue(staff);
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
  mockEarlierTemplates.mockResolvedValue([]);
  mockScoredYears.mockResolvedValue([]);
  mockDistributionFind.mockResolvedValue(null);
  mockAllocationUpdate.mockImplementation((args: unknown) => args);
  // saveDistribution passes a callback; liftStoredAllocations passes an array.
  mockTransaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg)
      ? arg
      : (arg as (tx: unknown) => unknown)({
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

  // ADMIN owns Кст and the caps; whether they may also write a кафедра's split
  // is the open question.
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

  // Money is left over because the формула itself leaves it — a cap holding
  // somebody down, or ladder dust. It can no longer be left over by typing a
  // smaller number, which is what this test used to do.
  it('accepts one that leaves some undistributed', async () => {
    uneven();
    expect(await saveDistribution(payload([100, 100, 75]))).toEqual({ success: true });
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

  // A departure is upward now — «тільки збільшити» — so 0,80 against a
  // proposed 0,75. It used to be downward, which the save no longer takes.
  it('saves a departure from the formula with no reason given', async () => {
    uneven();
    expect(await saveDistribution(unexplained([100, 100, 80]))).toEqual({ success: true });
  });

  it('saves a row that matches the formula, also with no reason', async () => {
    uneven();
    expect(await saveDistribution(unexplained([100, 100, 75]))).toEqual({ success: true });
  });

  it('keeps a reason when one is given', async () => {
    uneven();
    const result = await saveDistribution({
      departmentId: DEPT,
      year: YEAR,
      allocations: [
        { staffId: 's0', hundredths: 100, justification: 'гарант освітньої програми' },
        { staffId: 's1', hundredths: 100, justification: null },
        { staffId: 's2', hundredths: 80, justification: null },
      ],
    });
    expect(result).toEqual({ success: true });
  });
});

// «Початкову (автоматичну) ставку можна тільки збільшити». The owner restated
// it on 2026-08-19: the формула calculates, the завідувач adjusts, and nobody
// types a number below it — the only way a ставка comes down is ADMIN moving
// that person's Мін/Макс, which changes what the формула proposes.
//
// The grid has enforced this since it was written. The server did not, so a
// request made outside the UI could put додаток 2's «розподілено» column under
// its own «за формулою» column.
describe('saveDistribution — the формула is a floor', () => {
  it('refuses a value below what the формула proposes', async () => {
    uneven();
    const result = await saveDistribution(payload([100, 100, 70]));
    expect(result).toMatchObject({ error: expect.stringContaining('формула') });
  });

  it('accepts exactly the формула', async () => {
    uneven();
    expect(await saveDistribution(payload([100, 100, 75]))).toEqual({ success: true });
  });

  it('accepts a raise above it — that is the head’s whole job', async () => {
    uneven();
    expect(await saveDistribution(payload([100, 100, 95]))).toEqual({ success: true });
  });

  it('names the number and how to change it', async () => {
    uneven();
    const result = await saveDistribution(payload([100, 100, 70]));
    expect(result).toMatchObject({ error: expect.stringContaining('0,75') });
    expect(result).toMatchObject({ error: expect.stringContaining('Мін/Макс') });
  });

  // Refusing an overspend AND the floor together deadlocks the grid: ladder
  // rounding alone can put the формула's own proposal above Кст, and a head who
  // may only raise then has no legal move at all. Going down is the way out, so
  // while the кафедра is over both funds the floor steps aside.
  it('lifts the floor while the кафедра is over both funds', async () => {
    uneven();
    const staff = roster();
    staff[0].ratingEntries = [{ totalScore: 1500 }];
    staff[2].ratingEntries = [{ totalScore: 500 }];
    for (const person of staff) {
      person.stakeLimits = [{ minHundredths: 10, maxHundredths: 150 }] as never;
    }
    mockStaff.mockResolvedValue(staff);
    // 3,55 against a 3,00 pool — over, so a row may be pulled back down
    expect(await saveDistribution(payload([150, 150, 55]))).toEqual({ success: true });
  });

  // The бонусний фонд is part of what the кафедра has to spend, so it decides
  // whether they are over — the same attribution the grid's cards use.
  it('counts the бонусний фонд before calling it an overspend', async () => {
    uneven();
    mockStake.mockResolvedValue({ kstHundredths: 300, bonusPoolHundredths: 200 });
    // 2,75 against 5,00 of funds: comfortably inside, so the floor still binds
    const result = await saveDistribution(payload([100, 100, 70]));
    expect(result).toMatchObject({ error: expect.stringContaining('формула') });
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
    expect(await setStaffLimits(null, limitsForm('0,25', '1,00'))).toMatchObject({
      success: true,
    });
  });

  // The grid needs this to move the ставка when a cap moves: the row would
  // otherwise be left holding a number the next save refuses (2026-08-17). It
  // is the whole кафедра's formula, because both passes divide by sums over
  // everyone — one person's cap changes what every share comes to.
  it('returns the share recomputed against the bounds just written', async () => {
    const result = await setStaffLimits(null, limitsForm('0,10', '1,00'));
    expect(result).toMatchObject({ success: true });
    expect(result && 'formulaHundredths' in result && result.formulaHundredths).toBeGreaterThan(0);
  });

  it('returns a null share when the кафедра has no Кст to spread', async () => {
    mockStake.mockResolvedValue(null);
    expect(await setStaffLimits(null, limitsForm('0,10', '1,00'))).toEqual({
      success: true,
      formulaHundredths: null,
    });
  });

  it('returns a null share for somebody on no кафедра at all', async () => {
    mockStaffOne.mockResolvedValue({
      lastName: 'Прізвище',
      firstName: 'Ім’я',
      patronymic: 'По батькові',
      departmentId: null,
    });
    expect(await setStaffLimits(null, limitsForm('0,10', '1,00'))).toEqual({
      success: true,
      formulaHundredths: null,
    });
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

// A cap change moves what the формула proposes for EVERY row — both passes
// divide by sums over the whole кафедра — and the формула is a floor the server
// refuses to save under. So a stored allocation left below its new floor is not
// stale, it is a number that can no longer be written. The client used to
// correct only the one row that had been edited.
describe('setStaffLimits — re-settles the кафедра’s saved split', () => {
  function limitsForm(min: string, max: string, staffId = 's2') {
    const fd = new FormData();
    fd.set('staffId', staffId);
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
    // Even roster, 3,00 pool → the формула proposes 1,00 to each of the three
    mockStaff.mockResolvedValue(roster());
  });

  const saved = (values: number[]) =>
    mockDistributionFind.mockResolvedValue({
      id: 'dist-1',
      department: { name: 'Кафедра фізики' },
      allocations: values.map((proposedHundredths, i) => ({
        id: `alloc-${i}`,
        staffId: `s${i}`,
        proposedHundredths,
        staff: { lastName: `Прізвище${i}` },
      })),
    });

  it('does nothing when the кафедра has no saved split yet', async () => {
    mockDistributionFind.mockResolvedValue(null);
    await setStaffLimits(null, limitsForm('0,10', '1,00'));
    expect(mockAllocationUpdate).not.toHaveBeenCalled();
  });

  it('leaves a split that already matches the формула alone', async () => {
    saved([100, 100, 100]);
    await setStaffLimits(null, limitsForm('0,10', '1,00'));
    expect(mockAllocationUpdate).not.toHaveBeenCalled();
  });

  it('lifts a row that now sits under its new floor', async () => {
    saved([95, 100, 100]);
    await setStaffLimits(null, limitsForm('0,10', '1,00'));
    expect(mockAllocationUpdate).toHaveBeenCalledTimes(1);
    expect(mockAllocationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alloc-0' },
        data: expect.objectContaining({ proposedHundredths: 100 }),
      })
    );
  });

  // «Тільки збільшити» cuts both ways: what the head added on top of the
  // формула is their decision and survives a recompute untouched.
  it('leaves a raise the head typed above the формула alone', async () => {
    const staff = roster();
    for (const person of staff) {
      person.stakeLimits = [{ minHundredths: 10, maxHundredths: 150 }] as never;
    }
    mockStaff.mockResolvedValue(staff);
    saved([140, 100, 100]);
    await setStaffLimits(null, limitsForm('0,10', '1,50'));
    const touched = mockAllocationUpdate.mock.calls.map((c) => c[0].where.id);
    expect(touched).not.toContain('alloc-0');
  });

  // The red unsaveable row the grid used to open on: ADMIN drops a cap under a
  // number the head already agreed.
  it('brings a row above its new Макс back down to it', async () => {
    const staff = roster();
    staff[0].stakeLimits = [{ minHundredths: 10, maxHundredths: 50 }] as never;
    mockStaff.mockResolvedValue(staff);
    saved([100, 100, 100]);
    await setStaffLimits(null, limitsForm('0,10', '0,50', 's0'));
    expect(mockAllocationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alloc-0' },
        data: expect.objectContaining({ proposedHundredths: 50 }),
      })
    );
  });

  // Додаток 2 prints «за формулою» beside the head's number. A frozen column
  // still claiming the old proposal would assert a comparison never made.
  it('rewrites the stored формула figure too', async () => {
    saved([95, 100, 100]);
    await setStaffLimits(null, limitsForm('0,10', '1,00'));
    expect(mockAllocationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ formulaHundredths: 100 }),
      })
    );
  });
});

// ADMIN moves a cap and somebody else's ставка changes as a consequence. An
// entry for the cap alone would show the decision and hide the money.
describe('setStaffLimits — the re-settle is logged', () => {
  function limitsForm(min: string, max: string, staffId = 's2') {
    const fd = new FormData();
    fd.set('staffId', staffId);
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
    mockStaff.mockResolvedValue(roster());
    mockDistributionFind.mockResolvedValue({
      id: 'dist-1',
      department: { name: 'Кафедра фізики' },
      allocations: [95, 100, 100].map((proposedHundredths, i) => ({
        id: `alloc-${i}`,
        staffId: `s${i}`,
        proposedHundredths,
        staff: { lastName: `Прізвище${i}` },
      })),
    });
  });

  it('writes one entry for the кафедра, naming what moved', async () => {
    await setStaffLimits(null, limitsForm('0,10', '1,00'));

    // Two entries go out: one for the cap itself (StaffStakeLimits) and one for
    // the split it moved. This test is about the second.
    const entries = mockAuditCreate.mock.calls
      .map((c) => c[0].data)
      .filter((d: { entity: string }) => d.entity === 'StakeDistribution');
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry).toMatchObject({ action: 'UPDATE', entityId: 'dist-1', userId: 'a1' });
    expect(entry.label).toContain('перерахунок');
    // Only the row that actually moved, from 0,95 to the formula's 1,00
    expect(entry.changes).toEqual({ Прізвище0: { from: 95, to: 100 } });
  });

  it('writes nothing when no row had to move', async () => {
    mockDistributionFind.mockResolvedValue({
      id: 'dist-1',
      department: { name: 'Кафедра фізики' },
      allocations: [100, 100, 100].map((proposedHundredths, i) => ({
        id: `alloc-${i}`,
        staffId: `s${i}`,
        proposedHundredths,
        staff: { lastName: `Прізвище${i}` },
      })),
    });
    await setStaffLimits(null, limitsForm('0,10', '1,00'));
    // The cap itself is still logged; there is simply no split entry beside it.
    const entries = mockAuditCreate.mock.calls
      .map((c) => c[0].data)
      .filter((d: { entity: string }) => d.entity === 'StakeDistribution');
    expect(entries).toHaveLength(0);
  });
});
