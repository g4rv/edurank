import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/lib/generated/prisma/client';
import { parseRateSeeds, seedAllocations } from './seed-allocation';

describe('parseRateSeeds', () => {
  it('accepts a comma and a dot, because both get typed', () => {
    expect(parseRateSeeds({ d1: '0,75' })).toEqual({
      seeds: [{ departmentId: 'd1', hundredths: 75 }],
    });
    expect(parseRateSeeds({ d1: '0.75' })).toEqual({
      seeds: [{ departmentId: 'd1', hundredths: 75 }],
    });
  });

  // An empty box is «not decided», which is also what 0 means here. Neither is
  // «this кафедра pays nothing», so neither writes a row.
  it('writes nothing for an empty box or a zero', () => {
    expect(parseRateSeeds({ d1: '', d2: '   ', d3: '0', d4: '0,00' })).toEqual({ seeds: [] });
  });

  it('refuses a value off the 0,05 ladder', () => {
    expect(parseRateSeeds({ d1: '0,77' })).toEqual({ error: 'Ставка має бути кратною 0,05' });
  });

  // The ceiling is no longer a flat number here — it is the person's Макс on
  // that кафедра, which only `seedAllocations` can look up.
  it('leaves the ceiling to seedAllocations', () => {
    expect(parseRateSeeds({ d1: '2,00' })).toEqual({
      seeds: [{ departmentId: 'd1', hundredths: 200 }],
    });
  });

  it('refuses anything that is not a number', () => {
    expect(parseRateSeeds({ d1: 'пів' })).toEqual({
      error: 'Ставка має бути числом, наприклад 0,75',
    });
  });

  it('is empty when nothing was typed at all', () => {
    expect(parseRateSeeds(undefined)).toEqual({ seeds: [] });
  });
});

function fakeTx(
  existingAllocation: boolean,
  opts: {
    primaryDepartmentId?: string | null;
    limits?: { minHundredths: number; maxHundredths: number } | null;
    pool?: { kstHundredths: number } | null;
  } = {}
) {
  const { primaryDepartmentId = 'd1', limits = null, pool = { kstHundredths: 1000 } } = opts;
  return {
    stakeDistribution: { upsert: vi.fn().mockResolvedValue({ id: 'dist1' }) },
    stakeAllocation: {
      findUnique: vi.fn().mockResolvedValue(existingAllocation ? { id: 'a1' } : null),
      create: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    staffStakeLimits: { findUnique: vi.fn().mockResolvedValue(limits) },
    departmentStake: { findUnique: vi.fn().mockResolvedValue(pool) },
    department: { findUnique: vi.fn().mockResolvedValue({ name: 'Кафедра фінансів' }) },
    staff: {
      findUnique: vi.fn().mockResolvedValue({ departmentId: primaryDepartmentId }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

/**
 * The fake, narrowed to what `seedAllocations` actually touches.
 *
 * One cast, here, rather than an `any` at every call site — those needed an
 * eslint-disable each, and Prettier kept re-wrapping the calls so the comment
 * no longer sat on the line it was suppressing.
 */
function asTx(tx: ReturnType<typeof fakeTx>) {
  return tx as unknown as Prisma.TransactionClient;
}

describe('seedAllocations', () => {
  it('creates the кафедра’s distribution when the year has none', async () => {
    const tx = fakeTx(false);
    await seedAllocations(asTx(tx), 's1', [{ departmentId: 'd1', hundredths: 75 }], 2026);

    expect(tx.stakeDistribution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departmentId_year: { departmentId: 'd1', year: 2026 } },
        create: { departmentId: 'd1', year: 2026 },
        update: {},
      })
    );
  });

  // `filledAt` stays null: a кафедра nobody has opened must still read «не
  // заповнено» on /stakes, because one seeded row is not a spread pool.
  it('never marks the distribution as filled', async () => {
    const tx = fakeTx(false);
    await seedAllocations(asTx(tx), 's1', [{ departmentId: 'd1', hundredths: 75 }], 2026);

    const call = tx.stakeDistribution.upsert.mock.calls[0][0];
    expect(call.create).not.toHaveProperty('filledAt');
    expect(call.update).toEqual({});
  });

  // Додаток 2 prints the formula's proposal beside the head's number. A seed has
  // had no formula run, so the two agree — which also means `justification` is
  // not required.
  it('writes formulaHundredths equal to what was typed', async () => {
    const tx = fakeTx(false);
    await seedAllocations(asTx(tx), 's1', [{ departmentId: 'd1', hundredths: 75 }], 2026);

    expect(tx.stakeAllocation.create).toHaveBeenCalledWith({
      data: {
        distributionId: 'dist1',
        staffId: 's1',
        formulaHundredths: 75,
        proposedHundredths: 75,
      },
    });
  });

  // THE RULE. `docs/stake-distribution.md` gives the split to the завідувач, so
  // an ADMIN typing on a staff form must be unable to reach a number the head
  // has already decided — not merely discouraged from it.
  it('never overwrites an allocation the head already made', async () => {
    const tx = fakeTx(true);
    await seedAllocations(asTx(tx), 's1', [{ departmentId: 'd1', hundredths: 25 }], 2026);

    expect(tx.stakeAllocation.create).not.toHaveBeenCalled();
  });

  // THE OTHER RULE. The grid clamps every ставка to the person's Мін/Макс, so a
  // seed above it is a number the proper screen could never have produced — and
  // it left the profile and the кафедра's grid disagreeing (owner, 2026-09-21).
  it('refuses a ставка above the ceiling for that кафедра', async () => {
    const tx = fakeTx(false, { primaryDepartmentId: 'd1' }); // own кафедра → 1,00
    const refusal = await seedAllocations(
      asTx(tx),
      's1',
      [{ departmentId: 'd1', hundredths: 200 }],
      2026
    );

    expect(refusal).toBe('Ставка не може бути більшою за 1,00 на цій кафедрі');
    expect(tx.stakeAllocation.create).not.toHaveBeenCalled();
  });

  // An additional кафедра caps at 0,25 and never inherits the primary's 1,00.
  it('uses the 0,25 ceiling on a кафедра that is not their own', async () => {
    const tx = fakeTx(false, { primaryDepartmentId: 'other' });
    const refusal = await seedAllocations(
      asTx(tx),
      's1',
      [{ departmentId: 'd1', hundredths: 50 }],
      2026
    );

    expect(refusal).toBe('Ставка не може бути більшою за 0,25 на цій кафедрі');
  });

  it('honours an explicit StaffStakeLimits row over the fallback', async () => {
    const tx = fakeTx(false, {
      primaryDepartmentId: 'other',
      limits: { minHundredths: 10, maxHundredths: 150 },
    });
    const refusal = await seedAllocations(
      asTx(tx),
      's1',
      [{ departmentId: 'd1', hundredths: 150 }],
      2026
    );

    expect(refusal).toBeNull();
    expect(tx.stakeAllocation.create).toHaveBeenCalled();
  });

  it('refuses a ставка below the floor', async () => {
    const tx = fakeTx(false);
    const refusal = await seedAllocations(
      asTx(tx),
      's1',
      [{ departmentId: 'd1', hundredths: 5 }],
      2026
    );

    expect(refusal).toBe('Ставка не може бути меншою за 0,10');
  });

  // A ставка is a share of the кафедра's pool. With no Кст set there is nothing
  // to take a share of, and the head cannot open a meaningful grid either.
  it('refuses when ADMIN has not set the кафедра’s pool yet', async () => {
    const tx = fakeTx(false, { pool: null });
    const refusal = await seedAllocations(
      asTx(tx),
      's1',
      [{ departmentId: 'd1', hundredths: 75 }],
      2026
    );

    expect(refusal).toBe(
      'Спершу задайте основний фонд (Кст) для кафедри «Кафедра фінансів» на 2026 рік'
    );
    expect(tx.stakeAllocation.create).not.toHaveBeenCalled();
  });

  // Overspending is NOT the same as having no pool: the grid shows an overspend
  // rather than refusing it, because ladder rounding can put the formula's own
  // proposal above Кст.
  it('allows a ставка that overspends an existing pool', async () => {
    const tx = fakeTx(false, { pool: { kstHundredths: 10 } });
    const refusal = await seedAllocations(
      asTx(tx),
      's1',
      [{ departmentId: 'd1', hundredths: 100 }],
      2026
    );

    expect(refusal).toBeNull();
    expect(tx.stakeAllocation.create).toHaveBeenCalled();
  });

  it('does nothing at all when there is nothing to seed', async () => {
    const tx = fakeTx(false);
    await seedAllocations(asTx(tx), 's1', [], 2026);

    expect(tx.stakeDistribution.upsert).not.toHaveBeenCalled();
    expect(tx.staff.update).not.toHaveBeenCalled();
  });

  // `Staff.employmentRate` is Σ of every allocation, including ones this call
  // skipped, so it is recomputed rather than added to.
  it('recomputes the cached employmentRate afterwards', async () => {
    const tx = fakeTx(false);
    await seedAllocations(asTx(tx), 's1', [{ departmentId: 'd1', hundredths: 75 }], 2026);

    expect(tx.stakeAllocation.groupBy).toHaveBeenCalled();
    expect(tx.staff.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { employmentRate: 0 },
    });
  });
});
