import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    department: { findUnique: vi.fn() },
    staff: { findMany: vi.fn() },
    departmentStake: { findUnique: vi.fn() },
    stakeDistribution: { findUnique: vi.fn() },
  },
}));
vi.mock('./get-kharakterystyka', () => ({ getKharakterystykaMany: vi.fn() }));
vi.mock('./list-student-claims', async () => {
  const actual =
    await vi.importActual<typeof import('./list-student-claims')>('./list-student-claims');
  return { ...actual, bonusForStaff: vi.fn() };
});
vi.mock('@/lib/stake/rating-year', () => ({ ratingYearFor: vi.fn() }));

import { db } from '@/lib/db';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { bonusForStaff } from './list-student-claims';
import { ratingYearFor } from '@/lib/stake/rating-year';
import { getStakeDistribution } from './get-stake-distribution';

const mockStaff = db.staff.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  (ratingYearFor as unknown as Mock).mockResolvedValue(2025);
  (getKharakterystykaMany as unknown as Mock).mockResolvedValue(new Map());
  (bonusForStaff as unknown as Mock).mockResolvedValue(new Map());
  (db.department.findUnique as unknown as Mock).mockResolvedValue({
    id: 'd1',
    name: 'Кафедра ботаніки',
    faculty: { name: 'Природничий факультет' },
  });
  (db.departmentStake.findUnique as unknown as Mock).mockResolvedValue({
    kstHundredths: 300,
    bonusPoolHundredths: null,
  });
  (db.stakeDistribution.findUnique as unknown as Mock).mockResolvedValue(null);
});

/** `own` sits on d1; `guest` sits on d2 and is a сумісник here. */
function roster() {
  mockStaff.mockResolvedValue([
    {
      id: 'own',
      departmentId: 'd1',
      lastName: 'Власний',
      firstName: 'І',
      patronymic: 'П',
      adminPosition: null,
      ratingEntries: [{ totalScore: 1000 }],
      stakeLimits: [],
    },
    {
      id: 'guest',
      departmentId: 'd2',
      lastName: 'Гість',
      firstName: 'І',
      patronymic: 'П',
      adminPosition: null,
      ratingEntries: [{ totalScore: 9000 }],
      stakeLimits: [],
    },
  ]);
}

describe('getStakeDistribution with a сумісник', () => {
  it('marks the row whose primary кафедра is elsewhere', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.rows.find((r) => r.staffId === 'own')!.isPartTime).toBe(false);
    expect(view.rows.find((r) => r.staffId === 'guest')!.isPartTime).toBe(true);
  });

  it('sorts them last, however high their rating', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    // `guest` outranks `own` 9000 to 1000 and still comes second.
    expect(view.rows.map((r) => r.staffId)).toEqual(['own', 'guest']);
  });

  it('gives them the 0,25 ceiling, not the 1,00 one', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    const guest = view.rows.find((r) => r.staffId === 'guest')!;
    expect(guest.maxHundredths).toBe(25);
    expect(guest.hasOwnLimits).toBe(false);
    expect(guest.formulaHundredths).toBeLessThanOrEqual(25);
  });

  it('leaves the primary row on the 1,00 ceiling', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.rows.find((r) => r.staffId === 'own')!.maxHundredths).toBe(100);
  });

  it('shows their whole university rating, not a share of it', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.rows.find((r) => r.staffId === 'guest')!.rating).toBe(9000);
  });

  it('counts them in headcount, so the pool minimum covers them', async () => {
    roster();
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.headcount).toBe(2);
    expect(view.minimumKstHundredths).toBe(20);
  });

  it('keeps them out of Кнпп even when they meet every position', async () => {
    roster();
    (getKharakterystykaMany as unknown as Mock).mockResolvedValue(
      new Map([
        ['own', { metCount: 20 }],
        ['guest', { metCount: 20 }],
      ])
    );
    const view = (await getStakeDistribution('d1', 2026))!;
    expect(view.knpp).toBe(1);
  });

  it('asks the database for сумісники as well as primary staff', async () => {
    roster();
    await getStakeDistribution('d1', 2026);
    expect(mockStaff.mock.calls[0][0].where.OR).toEqual([
      { departmentId: 'd1' },
      { partTimeDepartments: { some: { departmentId: 'd1' } } },
    ]);
  });

  it('scopes the limits lookup to this кафедра', async () => {
    roster();
    await getStakeDistribution('d1', 2026);
    expect(mockStaff.mock.calls[0][0].select.stakeLimits.where).toEqual({
      year: 2026,
      departmentId: 'd1',
    });
  });
});
