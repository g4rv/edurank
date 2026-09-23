import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    scienceRecord: { count: vi.fn(), findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { listScienceRecords } from './list-science-records';

const mockCount = db.scienceRecord.count as unknown as Mock;
const mockFindMany = db.scienceRecord.findMany as unknown as Mock;

function scienceRecord(
  over: {
    id?: string;
    status?: 'APPROVED' | 'REMOVED';
    fileCount?: number;
    approvedCoAuthors?: number;
  } = {}
) {
  return {
    id: over.id ?? 'r1',
    hoursHundredths: 15000,
    status: over.status ?? 'APPROVED',
    removedReason: over.status === 'REMOVED' ? 'Посилання веде на іншу статтю' : null,
    createdAt: new Date('2026-09-18'),
    staff: { id: 's1', lastName: 'Петренко', firstName: 'Петро', patronymic: 'Петрович' },
    plan: { department: { name: 'Кафедра педагогіки' } },
    work: {
      id: 'w1',
      link: 'https://example.com/a',
      evidence: { title: 'Стаття про освіту' },
      executedMonth: new Date('2026-05-01T00:00:00Z'),
      totalHundredths: 20000,
      workType: {
        label: 'Наукова стаття',
        itemNumber: '4',
        evidenceFields: [{ kind: 'text', name: 'title', label: 'Назва' }],
      },
      files: Array.from({ length: over.fileCount ?? 0 }, (_, i) => ({
        id: `f${i}`,
        fileName: `доказ-${i}.pdf`,
        pageCount: null,
      })),
      // The APPROVED co-author rows this work carries, INCLUDING this record's
      // own — the query's `where: { status: 'APPROVED' }` on `work.records` is
      // what the flag actually rides on, so the fixture mirrors it directly
      // rather than re-deriving it.
      records: Array.from({ length: over.approvedCoAuthors ?? 1 }, (_, i) => ({ id: `rec${i}` })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCount.mockResolvedValue(0);
  mockFindMany.mockResolvedValue([]);
});

describe('listScienceRecords', () => {
  it('pages at PLAN_PAGE_SIZE, newest first', async () => {
    mockCount.mockResolvedValue(120);
    await listScienceRecords(2);

    expect(mockFindMany.mock.calls[0][0]).toMatchObject({
      orderBy: { createdAt: 'desc' },
      skip: 50,
      take: 50,
    });
  });

  it('falls back to page 1 for a bad page number', async () => {
    await listScienceRecords(0);
    expect(mockFindMany.mock.calls[0][0].skip).toBe(0);

    await listScienceRecords(Number.NaN);
    expect(mockFindMany.mock.calls[1][0].skip).toBe(0);
  });

  it('computes totalPages from the count, never from the page slice', async () => {
    mockCount.mockResolvedValue(101);
    const result = await listScienceRecords(1);
    expect(result.total).toBe(101);
    expect(result.totalPages).toBe(3);
  });

  it('carries ПІБ, кафедра, вид роботи, hours, link and the evidence summary', async () => {
    mockFindMany.mockResolvedValue([scienceRecord()]);
    const result = await listScienceRecords(1);

    expect(result.rows[0]).toMatchObject({
      id: 'r1',
      staffId: 's1',
      staffName: 'Петренко Петро Петрович',
      departmentName: 'Кафедра педагогіки',
      workTypeLabel: 'Наукова стаття',
      itemNumber: '4',
      link: 'https://example.com/a',
      hoursHundredths: 15000,
      totalHundredths: 20000,
      // D41 — ННВ compares it with the date on the linked page.
      executedMonth: '2026-05',
      status: 'APPROVED',
      removedReason: null,
    });
    expect(result.rows[0].summary).toContain('Стаття про освіту');
  });

  it('reports how many files the work carries', async () => {
    mockFindMany.mockResolvedValue([scienceRecord({ fileCount: 2 })]);
    const result = await listScienceRecords(1);
    // Each file, not a count — ННВ has to be able to open the evidence.
    expect(result.rows[0].files).toHaveLength(2);
    expect(result.rows[0].files[0]).toMatchObject({ id: 'f0', fileName: 'доказ-0.pdf' });
  });

  it('flags D28: files attached AND more than one APPROVED draw', async () => {
    mockFindMany.mockResolvedValue([scienceRecord({ fileCount: 1, approvedCoAuthors: 2 })]);
    const result = await listScienceRecords(1);
    expect(result.rows[0].sharedFiles).toBe(true);
  });

  it('does not flag a solo work even with a file attached', async () => {
    mockFindMany.mockResolvedValue([scienceRecord({ fileCount: 1, approvedCoAuthors: 1 })]);
    const result = await listScienceRecords(1);
    expect(result.rows[0].sharedFiles).toBe(false);
  });

  it('does not flag a shared work with no file at all', async () => {
    mockFindMany.mockResolvedValue([scienceRecord({ fileCount: 0, approvedCoAuthors: 2 })]);
    const result = await listScienceRecords(1);
    expect(result.rows[0].sharedFiles).toBe(false);
  });

  it('reads a declined record’s own status and reason, unfiltered by the query', async () => {
    mockFindMany.mockResolvedValue([scienceRecord({ status: 'REMOVED' })]);
    const result = await listScienceRecords(1);
    expect(result.rows[0].status).toBe('REMOVED');
    expect(result.rows[0].removedReason).toBe('Посилання веде на іншу статтю');
  });
});
