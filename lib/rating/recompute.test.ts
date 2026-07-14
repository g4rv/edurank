import { describe, expect, it, vi } from 'vitest';
import { recomputeRatingEntry, sumBySection } from './recompute';
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
      expect.objectContaining({ where: { staffId: 'staff-1', year: 2026, status: 'APPROVED' } })
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
});
