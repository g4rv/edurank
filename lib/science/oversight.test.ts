import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findUnique: vi.fn() } } }));

import { db } from '@/lib/db';
import { canOverseeScience } from './oversight';

const findStaff = db.staff.findUnique as unknown as Mock;

beforeEach(() => vi.clearAllMocks());

describe('canOverseeScience', () => {
  it('lets ADMIN in without a query', async () => {
    expect(await canOverseeScience({ role: 'ADMIN', staffId: 's1' })).toBe(true);
    expect(findStaff).not.toHaveBeenCalled();
  });

  it('lets in an EDITOR whose division carries the flag', async () => {
    findStaff.mockResolvedValue({ division: { canOverseeScience: true } });
    expect(await canOverseeScience({ role: 'EDITOR', staffId: 's1' })).toBe(true);
  });

  it('refuses an EDITOR whose division does not', async () => {
    findStaff.mockResolvedValue({ division: { canOverseeScience: false } });
    expect(await canOverseeScience({ role: 'EDITOR', staffId: 's1' })).toBe(false);
  });

  it('refuses an EDITOR with no division', async () => {
    findStaff.mockResolvedValue({ division: null });
    expect(await canOverseeScience({ role: 'EDITOR', staffId: 's1' })).toBe(false);
  });

  it('refuses a USER even if their row says otherwise', async () => {
    findStaff.mockResolvedValue({ division: { canOverseeScience: true } });
    expect(await canOverseeScience({ role: 'USER', staffId: 's1' })).toBe(false);
  });
});
