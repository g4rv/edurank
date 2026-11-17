import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    departmentIndicator: { findMany: vi.fn() },
    staff: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { EVIDENCE_FIELDS } from '@/lib/rating/evidence-fields';
import { DERIVATIONS_2026 } from '@/lib/department-rating/catalogue-2026';
import { getDepartmentDerived } from './get-department-derived';

const mockIndicators = db.departmentIndicator.findMany as unknown as Mock;
const mockStaff = db.staff.findMany as unknown as Mock;
const mockActivities = db.activity.findMany as unknown as Mock;

const person = (id: string) => ({ id, lastName: id, firstName: 'І', patronymic: 'П' });

const article = (staffId: string, option: string, doi: string, bibliography = `Стаття ${doi}`) => ({
  staffId,
  evidence: { option, doi, bibliography, link: '' },
  activityType: { code: 'publication_cat_a', evidenceFields: EVIDENCE_FIELDS.publication_cat_a },
});

/** The derived entries for one call, then the «внесли дані» people */
function given({ activities = [] as ReturnType<typeof article>[], entered = [] as string[] } = {}) {
  mockActivities.mockImplementation(async ({ distinct }: { distinct?: string[] }) =>
    distinct ? entered.map((staffId) => ({ staffId })) : activities
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIndicators.mockResolvedValue([
    { id: 'line-7.1', derivation: DERIVATIONS_2026['7.1'] },
    { id: 'line-7.2', derivation: DERIVATIONS_2026['7.2'] },
    { id: 'line-3', derivation: null },
  ]);
  mockStaff.mockResolvedValue([person('a'), person('b'), person('c')]);
});

describe('getDepartmentDerived', () => {
  it('counts a co-authored article once, on the line its quartile names', async () => {
    given({
      activities: [
        article('a', 'q1', '10.1000/one'),
        article('b', 'q1', '10.1000/ONE'),
        article('c', 'q3_4', '10.1000/two'),
      ],
      entered: ['a', 'b'],
    });

    const result = await getDepartmentDerived('dept', 2026);
    expect(result.lines['line-7.1']).toMatchObject({
      coverage: 'FULL',
      count: 1,
      authorCount: 2,
      needsCheck: 0,
    });
    expect(result.lines['line-7.1'].works[0].authors.map((x) => x.staffId)).toEqual(['a', 'b']);
    expect(result.lines['line-7.2']).toMatchObject({ coverage: 'FULL', count: 1 });
    expect(result).toMatchObject({ staffCount: 3, enteredCount: 2 });
  });

  it('has no entry for a line typed by hand', async () => {
    given();
    const result = await getDepartmentDerived('dept', 2026);
    expect(result.lines['line-3']).toBeUndefined();
    expect(result.lines['line-7.1']).toMatchObject({ count: 0, works: [] });
  });

  it('reads only the кафедра’s own штатні НПП on the roster, in the rating', async () => {
    given();
    await getDepartmentDerived('dept', 2026);
    expect(mockStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          departmentId: 'dept',
          archivedAt: null,
          isSystem: false,
          isNpp: true,
          isExternalPartTimer: false,
        },
      })
    );
  });

  it('reads only APPROVED entries of the year, of active indicators', async () => {
    given();
    await getDepartmentDerived('dept', 2026);
    const derivedCall = mockActivities.mock.calls.find(([arg]) => !arg.distinct)![0];
    expect(derivedCall.where).toMatchObject({
      year: 2026,
      status: 'APPROVED',
      staffId: { in: ['a', 'b', 'c'] },
      activityType: { isActive: true, template: { year: 2026 } },
    });
  });

  it('counts «внесли дані» from self-entered indicators only, never 5.1', async () => {
    given();
    await getDepartmentDerived('dept', 2026);
    const enteredCall = mockActivities.mock.calls.find(([arg]) => arg.distinct)![0];
    expect(enteredCall.where.activityType).toEqual({
      isActive: true,
      inputSource: 'NPP_SUBMISSION',
      gatesRating: false,
    });
  });

  it('asks for no entries on a кафедра with nobody on it', async () => {
    mockStaff.mockResolvedValue([]);
    given();
    const result = await getDepartmentDerived('dept', 2026);
    expect(mockActivities).not.toHaveBeenCalled();
    expect(result).toMatchObject({ staffCount: 0, enteredCount: 0 });
    expect(result.lines['line-7.1'].count).toBe(0);
  });
});
