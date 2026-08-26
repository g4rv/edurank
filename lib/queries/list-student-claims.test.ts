import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findMany: vi.fn() }, studentClaim: { findMany: vi.fn() } },
}));
vi.mock('./list-stake-settings', () => ({ getStakeYearSettings: vi.fn() }));

import { db } from '@/lib/db';
import { getStakeYearSettings } from './list-stake-settings';
import { listClaimsForReview } from './list-student-claims';

const mockStaff = db.staff.findMany as unknown as Mock;
const mockClaims = db.studentClaim.findMany as unknown as Mock;
const mockSettings = getStakeYearSettings as unknown as Mock;

// The review screen offers «Усі кафедри», so the query takes a LIST — and the
// people it gathers must include a сумісник, whose claims used to be reviewed
// by nobody because the filter read `departmentId` alone.

interface Person {
  id: string;
  name: string;
  /** null for somebody who holds only an additional post */
  primary: string | null;
  partTime?: string[];
}

function roster(people: Person[]) {
  mockStaff.mockResolvedValue(
    people.map((p) => ({
      id: p.id,
      lastName: p.name,
      firstName: 'Ім’я',
      patronymic: 'По батькові',
      department: p.primary ? { name: p.primary } : null,
      partTimeDepartments: (p.partTime ?? []).map((name) => ({ department: { name } })),
    }))
  );
}

/** One claim per person, all on different students so nothing is contested */
function claimsBy(staffIds: string[]) {
  const rows = staffIds.map((staffId, i) => ({
    id: `c${i}`,
    staffId,
    year: 2026,
    studentName: `Здобувач ${i}`,
    studentNameNormalised: `здобувач ${i}`,
    specialityId: 'sp1',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'CONTRACT',
    status: 'PENDING',
    rejectReason: null,
    createdAt: new Date('2026-08-20T10:00:00Z'),
    speciality: { name: 'Психологія', norms: [{ year: 2026, base: 100 }] },
  }));
  // The first call gathers this кафедра's own claims; the second gathers every
  // claim on the same students, university-wide, to find the duplicates.
  mockClaims.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSettings.mockResolvedValue({ contractCoefficient: 1 });
});

describe('listClaimsForReview', () => {
  it('asks for everybody on the кафедри, сумісники included', async () => {
    roster([{ id: 'npp-1', name: 'Ліщенко', primary: 'Кафедра ботаніки' }]);
    claimsBy(['npp-1']);

    await listClaimsForReview(['dep-1', 'dep-2'], 2026);

    const where = mockStaff.mock.calls[0]![0].where;
    expect(where.isNpp).toBe(true);
    expect(where.archivedAt).toBeNull();
    expect(where.OR).toEqual([
      { departmentId: { in: ['dep-1', 'dep-2'] } },
      { partTimeDepartments: { some: { departmentId: { in: ['dep-1', 'dep-2'] } } } },
    ]);
  });

  it('gathers several кафедри into one list for «Усі кафедри»', async () => {
    roster([
      { id: 'npp-1', name: 'Ліщенко', primary: 'Кафедра ботаніки' },
      { id: 'npp-2', name: 'Гаврилюк', primary: 'Кафедра екології' },
    ]);
    claimsBy(['npp-1', 'npp-2']);

    const claims = await listClaimsForReview(['dep-1', 'dep-2'], 2026);

    expect(claims.map((c) => c.claimedByDepartment)).toEqual([
      'Кафедра ботаніки',
      'Кафедра екології',
    ]);
  });

  it('names the кафедра of a сумісник who has no primary one', async () => {
    roster([{ id: 'npp-1', name: 'Ліщенко', primary: null, partTime: ['Кафедра екології'] }]);
    claimsBy(['npp-1']);

    const [claim] = await listClaimsForReview(['dep-2'], 2026);

    expect(claim?.claimedByDepartment).toBe('Кафедра екології');
  });

  it('asks the database nothing when there is no кафедра to review', async () => {
    expect(await listClaimsForReview([], 2026)).toEqual([]);
    expect(mockStaff).not.toHaveBeenCalled();
  });
});
