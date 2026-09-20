import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    sciencePlanTemplate: { findUnique: vi.fn() },
    sciencePlan: { findUnique: vi.fn() },
    stakeAllocation: { findFirst: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { getSciencePlan } from './get-science-plan';

const mockTemplate = db.sciencePlanTemplate.findUnique as unknown as Mock;
const mockPlan = db.sciencePlan.findUnique as unknown as Mock;
const mockAllocation = db.stakeAllocation.findFirst as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an OPEN template always reads the live розподіл', () => {
  beforeEach(() => {
    mockTemplate.mockResolvedValue({ minHoursPerRate: 500, stakeYear: 2026, status: 'OPEN' });
  });

  it('no plan yet — target still comes from the live allocation', async () => {
    mockPlan.mockResolvedValue(null);
    mockAllocation.mockResolvedValue({ proposedHundredths: 100 });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.plan).toBeNull();
    expect(result.target.rateHundredths).toBe(100);
    expect(result.target.targetHundredths).toBe(50000);
  });

  it('a plan exists but was saved with rateHundredths null — the live allocation still fills the target', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: null, rows: [], records: [] });
    mockAllocation.mockResolvedValue({ proposedHundredths: 100 });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.plan).toEqual({ id: 'p1' });
    expect(result.target.rateHundredths).toBe(100);
    expect(result.target.targetHundredths).toBe(50000);
  });

  it('no allocation anywhere — target stays null, the correct «no ставка» case', async () => {
    mockPlan.mockResolvedValue(null);
    mockAllocation.mockResolvedValue(null);

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.rateHundredths).toBeNull();
    expect(result.target.targetHundredths).toBeNull();
  });
});

describe('a CLOSED template keeps the frozen snapshot', () => {
  beforeEach(() => {
    mockTemplate.mockResolvedValue({ minHoursPerRate: 500, stakeYear: 2025, status: 'CLOSED' });
  });

  it('uses the stored plan.rateHundredths and never queries stakeAllocation', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: 100, rows: [], records: [] });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.rateHundredths).toBe(100);
    expect(result.target.targetHundredths).toBe(50000);
    expect(mockAllocation).not.toHaveBeenCalled();
  });

  it('no plan at all — target is null, not a live lookup', async () => {
    mockPlan.mockResolvedValue(null);

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.rateHundredths).toBeNull();
    expect(mockAllocation).not.toHaveBeenCalled();
  });
});

/**
 * One record on a plan. The shape mirrors the query's own `select`, so a change
 * to the select that this fixture does not follow shows up as a failure rather
 * than as a silently wrong page.
 */
function record(
  over: {
    id?: string;
    hours?: number;
    status?: 'APPROVED' | 'REMOVED';
    planRowId?: string | null;
    others?: { staffId: string; hoursHundredths: number; last: string }[];
    files?: { id: string; fileName: string; sizeBytes: number; pageCount: number | null }[];
  } = {}
) {
  return {
    id: over.id ?? 'rec-1',
    hoursHundredths: over.hours ?? 15000,
    status: over.status ?? 'APPROVED',
    removedReason: over.status === 'REMOVED' ? 'Посилання веде на іншу статтю' : null,
    planRowId: over.planRowId ?? null,
    work: {
      id: 'w1',
      link: 'https://example.com/a',
      evidence: { title: 'Стаття про освіту' },
      totalHundredths: 20000,
      workTypeId: 'wt1',
      workType: {
        label: 'Наукова стаття',
        itemNumber: '4',
        evidenceFields: [{ kind: 'text', name: 'title', label: 'Назва' }],
      },
      records: [
        { staffId: 's1', hoursHundredths: over.hours ?? 15000, staff: NAME('Петренко') },
        ...(over.others ?? []).map((o) => ({
          staffId: o.staffId,
          hoursHundredths: o.hoursHundredths,
          staff: NAME(o.last),
        })),
      ],
      files: over.files ?? [],
    },
  };
}

const NAME = (lastName: string) => ({ lastName, firstName: 'Іван', patronymic: 'Іванович' });

const planRow = (id: string, planned: number) => ({
  id,
  order: 0,
  workTypeId: 'wt1',
  workType: { label: 'Наукова стаття', itemNumber: '4', unitNote: null },
  details: {},
  plannedHundredths: planned,
  note: null,
});

describe('план and факт', () => {
  beforeEach(() => {
    mockTemplate.mockResolvedValue({ minHoursPerRate: 500, stakeYear: 2026, status: 'OPEN' });
    mockAllocation.mockResolvedValue({ proposedHundredths: 100 });
  });

  it('counts APPROVED draws into виконано', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: 100, rows: [], records: [record()] });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.doneHundredths).toBe(15000);
    expect(result.target.doneShortfallHundredths).toBe(35000);
  });

  it('EXCLUDES a declined draw from виконано but still returns it', async () => {
    // The person has to be able to read why it was declined (D20), and the
    // hours have to be back in the work's pool for a co-author to take.
    mockPlan.mockResolvedValue({
      id: 'p1',
      rateHundredths: 100,
      rows: [],
      records: [record({ status: 'REMOVED' })],
    });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.doneHundredths).toBe(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].status).toBe('REMOVED');
    expect(result.records[0].removedReason).toBe('Посилання веде на іншу статтю');
  });

  it('raises the plan row a record fulfils, for the «Виконано» marker', async () => {
    mockPlan.mockResolvedValue({
      id: 'p1',
      rateHundredths: 100,
      rows: [planRow('pr1', 20000), planRow('pr2', 10000)],
      records: [record({ planRowId: 'pr1' })],
    });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.rows.find((r) => r.id === 'pr1')?.doneHundredths).toBe(15000);
    expect(result.rows.find((r) => r.id === 'pr2')?.doneHundredths).toBe(0);
  });

  it('counts unplanned work in the total but against no row', async () => {
    // Ordinary: two articles planned, one article and a monograph published.
    mockPlan.mockResolvedValue({
      id: 'p1',
      rateHundredths: 100,
      rows: [planRow('pr1', 20000)],
      records: [record({ planRowId: null })],
    });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.target.doneHundredths).toBe(15000);
    expect(result.rows[0].doneHundredths).toBe(0);
  });

  it('names the co-authors of a shared work, and never the person themselves', async () => {
    mockPlan.mockResolvedValue({
      id: 'p1',
      rateHundredths: 100,
      rows: [],
      records: [
        record({
          hours: 15000,
          others: [{ staffId: 's2', hoursHundredths: 5000, last: 'Іваненко' }],
        }),
      ],
    });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.records[0].coAuthors).toEqual([
      { name: 'Іваненко І. І.', hoursHundredths: 5000 },
    ]);
    expect(result.records[0].totalHundredths).toBe(20000);
    expect(result.records[0].hoursHundredths).toBe(15000);
  });

  it('has no co-authors for a work only this person drew on', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: 100, rows: [], records: [record()] });
    const result = await getSciencePlan('s1', 'd1', 't1');
    expect(result.records[0].coAuthors).toEqual([]);
  });

  it('passes through every attached file, name/size/pageCount and all', async () => {
    // Item 4 prices per page, and that is the number a reviewer compares — so
    // the query has to carry the real row, not a bare count.
    const files = [
      { id: 'f1', fileName: 'стаття.pdf', sizeBytes: 204800, pageCount: 12 },
      { id: 'f2', fileName: 'наказ.png', sizeBytes: 51200, pageCount: null },
    ];
    mockPlan.mockResolvedValue({
      id: 'p1',
      rateHundredths: 100,
      rows: [],
      records: [record({ files })],
    });

    const result = await getSciencePlan('s1', 'd1', 't1');

    expect(result.records[0].files).toEqual(files);
  });

  it('has an empty files array for a record with no evidence file', async () => {
    mockPlan.mockResolvedValue({ id: 'p1', rateHundredths: 100, rows: [], records: [record()] });
    const result = await getSciencePlan('s1', 'd1', 't1');
    expect(result.records[0].files).toEqual([]);
  });
});
