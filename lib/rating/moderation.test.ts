import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findUnique: vi.fn() } },
}));

import { db } from '@/lib/db';
import { canModerateRating } from './moderation';

const mockStaffFind = db.staff.findUnique as unknown as Mock;

/** What the query returns for an editor whose division does or does not moderate */
function divisionAllows(canModerate: boolean | null) {
  mockStaffFind.mockResolvedValue(
    canModerate === null ? { division: null } : { division: { canModerateRating: canModerate } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('canModerateRating', () => {
  it('always allows ADMIN, without asking the database', async () => {
    expect(await canModerateRating({ role: 'ADMIN', staffId: 'a1' })).toBe(true);
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  it('refuses a USER', async () => {
    expect(await canModerateRating({ role: 'USER', staffId: 's1' })).toBe(false);
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  it('allows an EDITOR whose division carries the flag', async () => {
    divisionAllows(true);
    expect(await canModerateRating({ role: 'EDITOR', staffId: 'e1' })).toBe(true);
  });

  it('refuses an EDITOR whose division does not', async () => {
    divisionAllows(false);
    expect(await canModerateRating({ role: 'EDITOR', staffId: 'e1' })).toBe(false);
  });

  it('refuses an EDITOR who belongs to no division', async () => {
    divisionAllows(null);
    expect(await canModerateRating({ role: 'EDITOR', staffId: 'e1' })).toBe(false);
  });

  it('refuses an EDITOR with no staff record behind the session', async () => {
    expect(await canModerateRating({ role: 'EDITOR', staffId: null })).toBe(false);
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  // The point of the flag: the division's name is a label an admin may edit,
  // and renaming it used to revoke moderation from everyone in it.
  it('does not depend on the division being named ННВ', async () => {
    mockStaffFind.mockResolvedValue({
      division: { canModerateRating: true, name: 'Відділ з новою назвою' },
    });
    expect(await canModerateRating({ role: 'EDITOR', staffId: 'e1' })).toBe(true);
  });
});
