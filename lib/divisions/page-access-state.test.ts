import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findUnique: vi.fn() } } }));

import { db } from '@/lib/db';
import { ALL_PAGES, NO_PAGES } from './page-access';
import { pageAccessFor } from './page-access-state';

const findStaff = db.staff.findUnique as unknown as Mock;

/** A division row as the loader selects it — nothing on */
const division = (over: Record<string, unknown> = {}) => ({
  canViewStaff: false,
  canViewDepartments: false,
  canViewFaculties: false,
  canViewRating: false,
  canViewCharts: false,
  canModerateRating: false,
  canOverseeScience: false,
  canViewQualifications: false,
  canInviteStaff: false,
  canSetPasswords: false,
  canEndSessions: false,
  entityPermissions: [],
  _count: { fieldPermissions: 0 },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('pageAccessFor', () => {
  it('opens every page to ADMIN without a query', async () => {
    expect(await pageAccessFor({ role: 'ADMIN', staffId: 'a1' })).toEqual(ALL_PAGES);
    expect(findStaff).not.toHaveBeenCalled();
  });

  it('opens none of the five to a USER, without a query', async () => {
    expect(await pageAccessFor({ role: 'USER', staffId: 'u1' })).toEqual(NO_PAGES);
    expect(findStaff).not.toHaveBeenCalled();
  });

  it('opens none to an EDITOR with no division', async () => {
    findStaff.mockResolvedValue({ division: null });
    expect(await pageAccessFor({ role: 'EDITOR', staffId: 'e1' })).toEqual(NO_PAGES);
  });

  it('opens what the division switched on', async () => {
    findStaff.mockResolvedValue({ division: division({ canViewRating: true }) });
    expect(await pageAccessFor({ role: 'EDITOR', staffId: 'e2' })).toEqual({
      ...NO_PAGES,
      rating: true,
    });
  });

  it('opens Штат for a division with a field grant, its switch off', async () => {
    findStaff.mockResolvedValue({ division: division({ _count: { fieldPermissions: 3 } }) });
    expect((await pageAccessFor({ role: 'EDITOR', staffId: 'e3' })).staff).toBe(true);
  });

  it('opens Кафедри for a division with a кафедра right', async () => {
    findStaff.mockResolvedValue({
      division: division({ entityPermissions: [{ entity: 'DEPARTMENT' }] }),
    });
    const access = await pageAccessFor({ role: 'EDITOR', staffId: 'e4' });
    expect(access).toEqual({ ...NO_PAGES, departments: true });
  });

  it('opens Рейтинг НПП for a moderating division', async () => {
    findStaff.mockResolvedValue({ division: division({ canModerateRating: true }) });
    expect((await pageAccessFor({ role: 'EDITOR', staffId: 'e5' })).rating).toBe(true);
  });
});
