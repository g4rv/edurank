import { describe, expect, it, vi } from 'vitest';
import { recomputeRatingEntries, recomputeRatingEntry, sumBySection } from './recompute';
import type { Prisma } from '@/lib/generated/prisma/client';

describe('sumBySection', () => {
  it('sums scores into their section buckets', () => {
    const totals = sumBySection([
      { score: 50, sectionNumber: 1 },
      { score: 30, sectionNumber: 1 },
      { score: 600, sectionNumber: 3 },
      { score: 150, sectionNumber: 5 },
    ]);
    expect(totals).toEqual({
      section1Score: 80,
      section2Score: 0,
      section3Score: 600,
      section4Score: 0,
      section5Score: 150,
      totalScore: 830,
    });
  });

  it('returns zeros for no activities', () => {
    expect(sumBySection([]).totalScore).toBe(0);
  });

  it('ignores unknown section numbers', () => {
    const totals = sumBySection([
      { score: 10, sectionNumber: 0 },
      { score: 10, sectionNumber: 6 },
      { score: 10, sectionNumber: 2 },
    ]);
    expect(totals.section2Score).toBe(10);
    expect(totals.totalScore).toBe(10);
  });

  it('removal is reflected by summing only what remains', () => {
    const before = sumBySection([
      { score: 40, sectionNumber: 2 },
      { score: 40, sectionNumber: 2 },
    ]);
    const after = sumBySection([{ score: 40, sectionNumber: 2 }]);
    expect(before.section2Score - after.section2Score).toBe(40);
  });

  // The bug: adding clean 2-decimal scores with + leaves binary-float dust that
  // was written straight into the DB. Buckets and total must come back clean.
  it('rounds away float-addition dust so the DB stores clean 2-decimal values', () => {
    const totals = sumBySection([
      { score: 0.1, sectionNumber: 1 },
      { score: 0.2, sectionNumber: 1 },
      { score: 8.33, sectionNumber: 3 },
      { score: 8.34, sectionNumber: 3 },
    ]);
    // Not 0.30000000000000004 / 16.669999999999998
    expect(totals.section1Score).toBe(0.3);
    expect(totals.section3Score).toBe(16.67);
    expect(totals.totalScore).toBe(16.97);
  });

  it('the total equals the sum of the rounded section buckets', () => {
    const totals = sumBySection([
      { score: 1.005, sectionNumber: 1 },
      { score: 2.005, sectionNumber: 2 },
    ]);
    const sumOfBuckets =
      totals.section1Score +
      totals.section2Score +
      totals.section3Score +
      totals.section4Score +
      totals.section5Score;
    expect(totals.totalScore).toBe(Math.round(sumOfBuckets * 100) / 100);
  });
});

// M6.4: the DB-facing wrapper — reads only APPROVED rows, upserts the entry
describe('recomputeRatingEntry', () => {
  function mockTx(rows: { score: number; sectionNumber: number }[]) {
    return {
      activity: {
        findMany: vi.fn().mockResolvedValue(
          rows.map((r) => ({
            score: r.score,
            activityType: { section: { number: r.sectionNumber } },
          }))
        ),
      },
      ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
    };
  }

  it('submit adds: totals match the approved rows', async () => {
    const tx = mockTx([
      { score: 300, sectionNumber: 3 },
      { score: 50, sectionNumber: 1 },
    ]);
    const totals = await recomputeRatingEntry(
      tx as unknown as Prisma.TransactionClient,
      'staff-1',
      2026
    );

    expect(tx.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          staffId: 'staff-1',
          year: 2026,
          status: 'APPROVED',
          activityType: { isActive: true },
        },
      })
    );
    expect(totals).toEqual({
      section1Score: 50,
      section2Score: 0,
      section3Score: 300,
      section4Score: 0,
      section5Score: 0,
      totalScore: 350,
    });
    expect(tx.ratingEntry.upsert).toHaveBeenCalledWith({
      where: { staffId_year: { staffId: 'staff-1', year: 2026 } },
      create: { staffId: 'staff-1', year: 2026, ...totals },
      update: totals,
    });
  });

  it('discard subtracts: recompute after removal writes the smaller totals', async () => {
    // Same staff after one 300-point activity was discarded (no longer APPROVED)
    const tx = mockTx([{ score: 50, sectionNumber: 1 }]);
    const totals = await recomputeRatingEntry(
      tx as unknown as Prisma.TransactionClient,
      'staff-1',
      2026
    );
    expect(totals.totalScore).toBe(50);
    expect(totals.section3Score).toBe(0);
  });

  it('no approved rows left → entry zeroed, not deleted', async () => {
    const tx = mockTx([]);
    const totals = await recomputeRatingEntry(
      tx as unknown as Prisma.TransactionClient,
      'staff-1',
      2026
    );
    expect(totals.totalScore).toBe(0);
    expect(tx.ratingEntry.upsert).toHaveBeenCalled();
  });

  // A deactivated indicator must score nothing: the filter is what enforces it,
  // so assert the query never asks for rows of an inactive type.
  it('asks only for rows of a still-active indicator', async () => {
    const tx = mockTx([]);
    await recomputeRatingEntry(tx as unknown as Prisma.TransactionClient, 'staff-1', 2026);
    const where = tx.activity.findMany.mock.calls[0][0].where;
    expect(where.activityType).toEqual({ isActive: true });
  });
});

describe('recomputeRatingEntries (bulk)', () => {
  function mockBulkTx(rows: { staffId: string; score: number; sectionNumber: number }[]) {
    return {
      activity: {
        findMany: vi.fn().mockResolvedValue(
          rows.map((r) => ({
            staffId: r.staffId,
            score: r.score,
            activityType: { section: { number: r.sectionNumber } },
          }))
        ),
      },
      ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
    };
  }

  it('reads once and upserts one entry per staff', async () => {
    const tx = mockBulkTx([
      { staffId: 'a', score: 50, sectionNumber: 1 },
      { staffId: 'a', score: 300, sectionNumber: 3 },
      { staffId: 'b', score: 30, sectionNumber: 1 },
    ]);
    await recomputeRatingEntries(tx as unknown as Prisma.TransactionClient, ['a', 'b'], 2026);

    expect(tx.activity.findMany).toHaveBeenCalledTimes(1);
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(2);

    const [first, second] = tx.ratingEntry.upsert.mock.calls;
    expect(first[0].update).toMatchObject({
      section1Score: 50,
      section3Score: 300,
      totalScore: 350,
    });
    expect(second[0].update).toMatchObject({ section1Score: 30, totalScore: 30 });
  });

  it('zeroes a staff member whose last counting row went away', async () => {
    // 'b' has no rows left after the indicator was deactivated
    const tx = mockBulkTx([{ staffId: 'a', score: 50, sectionNumber: 1 }]);
    await recomputeRatingEntries(tx as unknown as Prisma.TransactionClient, ['a', 'b'], 2026);

    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(2);
    const zeroed = tx.ratingEntry.upsert.mock.calls.find(
      (c) => c[0].where.staffId_year.staffId === 'b'
    );
    expect(zeroed?.[0].update.totalScore).toBe(0);
  });

  it('does nothing for an empty staff list', async () => {
    const tx = mockBulkTx([]);
    await recomputeRatingEntries(tx as unknown as Prisma.TransactionClient, [], 2026);
    expect(tx.activity.findMany).not.toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).not.toHaveBeenCalled();
  });
});
