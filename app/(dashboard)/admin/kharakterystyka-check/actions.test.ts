import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    kharakterystykaEntry: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/queries/get-active-template', () => ({ activeYear: vi.fn() }));
vi.mock('@/lib/queries/list-kharakterystyka-duplicates', () => ({
  findRatingDuplicates: vi.fn(),
}));
vi.mock('@/lib/queries/get-kharakterystyka', () => ({
  getKharakterystyka: vi.fn(),
  getKharakterystykaWithoutEntries: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { activeYear } from '@/lib/queries/get-active-template';
import { findRatingDuplicates } from '@/lib/queries/list-kharakterystyka-duplicates';
import {
  getKharakterystyka,
  getKharakterystykaWithoutEntries,
} from '@/lib/queries/get-kharakterystyka';
import { hideYearCheckEntries, previewYearCheckHide, restoreYearCheckEntries } from './actions';

const mockAuth = auth as unknown as Mock;
const mockFind = db.kharakterystykaEntry.findMany as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockYear = activeYear as unknown as Mock;
const mockTwins = findRatingDuplicates as unknown as Mock;
const mockBefore = getKharakterystyka as unknown as Mock;
const mockAfter = getKharakterystykaWithoutEntries as unknown as Mock;

const STAFF = { lastName: 'Рижков', firstName: 'Олександр', patronymic: 'Сергійович' };

function line(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    staffId: 's1',
    position: 1,
    year: 2022,
    text: 'Ming L., Ryzhkov O. Integrated platform. IEEE SIST (Nur-Sultan, 28–30 Apr. 2021).',
    source: 'MANUAL',
    removedAt: null,
    removedReason: null,
    staff: STAFF,
    ...over,
  };
}

function mockTx() {
  const tx = {
    kharakterystykaEntry: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

const asAdmin = () => mockAuth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } });

describe('the year check actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockYear.mockResolvedValue(2026);
    mockTwins.mockResolvedValue(new Map());
  });

  describe('who may', () => {
    it.each([
      ['hide', () => hideYearCheckEntries({ ids: ['e1'], kind: 'year' })],
      ['restore', () => restoreYearCheckEntries({ ids: ['e1'] })],
      ['preview', () => previewYearCheckHide({ ids: ['e1'], kind: 'year' })],
    ])('refuses anybody but ADMIN to %s', async (_name, run) => {
      mockAuth.mockResolvedValue({ user: { id: 'e', role: 'EDITOR' } });
      expect(await run()).toEqual({ error: 'Недостатньо прав' });
      expect(mockFind).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('refuses an empty or oversized selection', async () => {
      asAdmin();
      expect(await hideYearCheckEntries({ ids: [], kind: 'year' })).toEqual({
        error: 'Невірні дані',
      });
      expect(
        await hideYearCheckEntries({
          ids: Array.from({ length: 301 }, (_, i) => `e${i}`),
          kind: 'year',
        })
      ).toEqual({ error: 'Невірні дані' });
    });
  });

  describe('hideYearCheckEntries', () => {
    it('hides a wrong line with the reason, who and when, and audits it', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([line()]);

      expect(await hideYearCheckEntries({ ids: ['e1'], kind: 'year' })).toEqual({
        success: true,
        count: 1,
      });

      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          removedAt: expect.any(Date),
          removedBy: 'admin',
          removedReason: 'YEAR_OUT_OF_WINDOW',
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'UPDATE',
          entity: 'KharakterystykaEntry',
          entityId: 'e1',
          userId: 'admin',
        }),
      });
    });

    it('judges every id again — a clean line the browser ticked is not hidden', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([
        line({ id: 'old' }),
        line({ id: 'clean', text: 'Автор. Назва. Журнал. 2024. №1.' }),
        line({ id: 'no-year', text: 'Назва без року' }),
      ]);

      expect(
        await hideYearCheckEntries({ ids: ['old', 'clean', 'no-year'], kind: 'year' })
      ).toEqual({
        success: true,
        count: 1,
      });
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledTimes(1);
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'old' } })
      );
    });

    it('leaves alone a line already removed, outside the window, or in another position', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([
        line({ id: 'gone', removedAt: new Date() }),
        line({ id: 'outside', year: 2020 }),
        line({ id: 'patent', position: 2 }),
      ]);

      expect(
        await hideYearCheckEntries({ ids: ['gone', 'outside', 'patent'], kind: 'year' })
      ).toEqual({
        error: 'Немає записів, які можна приховати',
      });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(tx.kharakterystykaEntry.update).not.toHaveBeenCalled();
    });

    it('is refused when no rating year is set', async () => {
      asAdmin();
      mockYear.mockResolvedValue(null);
      expect(await hideYearCheckEntries({ ids: ['e1'], kind: 'year' })).toEqual({
        error: 'Рейтинговий рік ще не налаштовано',
      });
    });

    it('changes nothing when the write fails', async () => {
      asAdmin();
      mockFind.mockResolvedValue([line()]);
      mockTransaction.mockRejectedValue(new Error('db down'));
      expect(await hideYearCheckEntries({ ids: ['e1'], kind: 'year' })).toEqual({
        error: 'Не вдалося приховати записи. Нічого не змінено',
      });
    });
  });

  describe('hiding duplicates of the rating', () => {
    const twin = { activityId: 'a1', year: 2026, itemNumber: '3.9', label: 'Стаття', text: 'x' };

    it('hides a typed line that copies a rating entry, with its own reason', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([line({ id: 'copy', text: 'Назва без року' })]);
      mockTwins.mockResolvedValue(new Map([['copy', twin]]));

      expect(await hideYearCheckEntries({ ids: ['copy'], kind: 'duplicate' })).toEqual({
        success: true,
        count: 1,
      });
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledWith({
        where: { id: 'copy' },
        data: {
          removedAt: expect.any(Date),
          removedBy: 'admin',
          removedReason: 'DUPLICATE_OF_RATING',
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          label: expect.stringContaining('дублікат запису з рейтингу'),
        }),
      });
    });

    it('judges again — a line with no twin in the rating is not hidden', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([line({ id: 'alone' }), line({ id: 'copy' })]);
      mockTwins.mockResolvedValue(new Map([['copy', twin]]));

      expect(await hideYearCheckEntries({ ids: ['alone', 'copy'], kind: 'duplicate' })).toEqual({
        success: true,
        count: 1,
      });
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledTimes(1);
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'copy' } })
      );
    });

    it('never offers an imported line as a copy', async () => {
      asAdmin();
      mockTx();
      mockFind.mockResolvedValue([line({ id: 'imported', source: 'IMPORT' })]);
      mockTwins.mockResolvedValue(new Map([['imported', twin]]));

      expect(await hideYearCheckEntries({ ids: ['imported'], kind: 'duplicate' })).toEqual({
        error: 'Немає записів, які можна приховати',
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('refuses a payload that does not say what the hide is for', async () => {
      asAdmin();
      expect(await hideYearCheckEntries({ ids: ['e1'] })).toEqual({ error: 'Невірні дані' });
      expect(await hideYearCheckEntries({ ids: ['e1'], kind: 'anything' })).toEqual({
        error: 'Невірні дані',
      });
    });

    it('brings back a line hidden as a copy', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([
        line({ removedAt: new Date(), removedReason: 'DUPLICATE_OF_RATING' }),
      ]);

      expect(await restoreYearCheckEntries({ ids: ['e1'] })).toEqual({ success: true, count: 1 });
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { removedAt: null, removedBy: null, removedReason: null },
      });
    });
  });

  describe('restoreYearCheckEntries', () => {
    it('brings back a line this page hid and clears the mark', async () => {
      asAdmin();
      const tx = mockTx();
      mockFind.mockResolvedValue([
        line({ removedAt: new Date(), removedReason: 'YEAR_OUT_OF_WINDOW' }),
      ]);

      expect(await restoreYearCheckEntries({ ids: ['e1'] })).toEqual({ success: true, count: 1 });
      expect(tx.kharakterystykaEntry.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { removedAt: null, removedBy: null, removedReason: null },
      });
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('only asks the database for lines this page hid', async () => {
      asAdmin();
      mockTx();
      mockFind.mockResolvedValue([]);

      expect(await restoreYearCheckEntries({ ids: ['by-a-person'] })).toEqual({
        error: 'Немає записів, які можна повернути',
      });
      // A removal a person made has no reason — the query itself leaves it out
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['by-a-person'] },
            removedReason: { in: ['YEAR_OUT_OF_WINDOW', 'DUPLICATE_OF_RATING'] },
          },
        })
      );
    });
  });

  describe('previewYearCheckHide', () => {
    it('says how many positions a person meets before and after, per person', async () => {
      asAdmin();
      mockFind.mockResolvedValue([line(), line({ id: 'e2' })]);
      mockBefore.mockResolvedValue({
        metCount: 5,
        qualifies: true,
        positions: [
          { number: 1, met: true },
          { number: 3, met: true },
        ],
      });
      mockAfter.mockResolvedValue({
        metCount: 3,
        qualifies: false,
        positions: [
          { number: 1, met: false },
          { number: 3, met: true },
        ],
      });

      expect(await previewYearCheckHide({ ids: ['e1', 'e2'], kind: 'year' })).toEqual({
        people: [
          {
            staffId: 's1',
            name: 'Рижков Олександр Сергійович',
            lines: 2,
            metBefore: 5,
            metAfter: 3,
            total: 2,
            qualifiesBefore: true,
            qualifiesAfter: false,
            lostPositions: [1],
          },
        ],
      });
      expect(mockAfter).toHaveBeenCalledWith('s1', 2026, ['e1', 'e2']);
    });
  });
});
